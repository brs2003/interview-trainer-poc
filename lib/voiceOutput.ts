'use client';

import { markTiming } from './timing';

// Tracks the single in-flight/playing utterance so a new createSpeechStream()
// call always silences whatever is currently talking, mirroring window
// .speechSynthesis's implicit single-utterance behavior. `streamId`
// invalidates any callbacks from a stream that's been superseded or
// cancelled, without needing to null out closures captured by in-flight
// Audio/utterance event handlers.
let currentAudio: HTMLAudioElement | null = null;
let currentUtterance: SpeechSynthesisUtterance | null = null;
let streamId = 0;

export interface SpeechStreamHandle {
  /** Enqueue the next completed sentence/chunk of text to be spoken. */
  push(text: string): void;
  /** Signal that no more text is coming; fires onEnd once playback drains. */
  end(): void;
}

export function isNativeTTSSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

const MALE_VOICE_HINTS = ['David', 'Daniel', 'Guy', 'Mark', 'Alex', 'Fred', 'George', 'James', 'Ryan', 'Matthew'];
const FEMALE_VOICE_HINTS = ['Zira', 'Samantha', 'Victoria', 'Emma', 'Susan', 'Karen', 'Linda', 'Moira', 'Tessa', 'Google US English'];

// Voice lists load asynchronously in some browsers; resolves once populated
// (or immediately if already available), so callers don't have to special-case it.
function getVoicesAsync(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const existing = window.speechSynthesis.getVoices();
    if (existing.length > 0) {
      resolve(existing);
      return;
    }

    const handleVoicesChanged = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);

    // Fallback in case voiceschanged never fires on this browser
    setTimeout(() => {
      window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
      resolve(window.speechSynthesis.getVoices());
    }, 1000);
  });
}

function pickVoiceForGender(
  voices: SpeechSynthesisVoice[],
  gender: 'male' | 'female' | undefined
): SpeechSynthesisVoice | undefined {
  const englishVoices = voices.filter((v) => v.lang.startsWith('en'));
  const pool = englishVoices.length > 0 ? englishVoices : voices;

  if (gender === 'male') {
    return (
      pool.find((v) => MALE_VOICE_HINTS.some((hint) => v.name.includes(hint))) ||
      pool.find((v) => v.name.includes('Google') || v.name.includes('Natural'))
    );
  }

  if (gender === 'female') {
    return (
      pool.find((v) => FEMALE_VOICE_HINTS.some((hint) => v.name.includes(hint))) ||
      pool.find((v) => v.name.includes('Google') || v.name.includes('Natural'))
    );
  }

  return pool.find(
    (v) => v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Daniel')
  );
}

// Our OpenRouter voice ids are Kokoro's (see lib/voices.ts), prefixed by
// accent+gender: af_/bf_ (female), am_/bm_ (male). The native path has no
// concept of that id, only a browser voice list, so this is the only signal
// available to steer pickVoiceForGender() the same way for both backends.
function inferGenderFromVoiceId(voiceId: string): 'male' | 'female' | undefined {
  if (voiceId.startsWith('af_') || voiceId.startsWith('bf_')) return 'female';
  if (voiceId.startsWith('am_') || voiceId.startsWith('bm_')) return 'male';
  return undefined;
}

function ttsUrl(text: string, voice: string): string {
  const params = new URLSearchParams({ text, voice });
  return `/api/tts?${params.toString()}`;
}

/**
 * Speaks a stream of text chunks (typically one LLM-generated sentence at a
 * time) as they become available, playing each chunk's synthesized audio the
 * moment it's ready rather than waiting for the whole reply to be generated
 * first. Chunks play back-to-back in push() order.
 *
 * Prefers the browser's native speechSynthesis (zero network round trip —
 * the fastest option when available), falling back to the OpenRouter-backed
 * /api/tts route for browsers without it.
 *
 * `onBoundary` reports a char offset into the concatenation of all pushed
 * chunks so far. Native speechSynthesis gives a true per-word boundary; the
 * server-streamed fallback estimates it (proportional to
 * audio.currentTime/duration, which can be unreliable before a streamed
 * response finishes — that case is simply skipped rather than guessed at).
 */
export function createSpeechStream(
  voice: string,
  onEnd: () => void,
  onError: (err: unknown) => void,
  shouldCancel: () => boolean,
  onBoundary?: (charIndex: number) => void
): SpeechStreamHandle {
  stopSpeaking();

  const myStreamId = ++streamId;
  const isCurrent = () => streamId === myStreamId && !shouldCancel();

  return isNativeTTSSupported()
    ? createNativeSpeechStream(voice, onEnd, onError, isCurrent, onBoundary)
    : createServerSpeechStream(voice, onEnd, onError, isCurrent, onBoundary);
}

function createNativeSpeechStream(
  voiceId: string,
  onEnd: () => void,
  onError: (err: unknown) => void,
  isCurrent: () => boolean,
  onBoundary?: (charIndex: number) => void
): SpeechStreamHandle {
  const gender = inferGenderFromVoiceId(voiceId);
  const queue: string[] = [];
  let ended = false;
  let playing = false;
  let charOffset = 0;
  let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

  const playNext = async () => {
    if (!isCurrent()) return;

    if (queue.length === 0) {
      playing = false;
      if (ended) {
        currentUtterance = null;
        onEnd();
      }
      return;
    }

    playing = true;
    const chunk = queue.shift()!;
    const chunkStart = charOffset;

    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.lang = 'en-US';
    // Pitch/rate nudge so male/female stay audibly distinct even on devices
    // that only expose one or two generic voices.
    if (gender === 'male') {
      utterance.pitch = 0.85;
      utterance.rate = 0.97;
    } else if (gender === 'female') {
      utterance.pitch = 1.15;
      utterance.rate = 1.03;
    }

    if (!voicesPromise) voicesPromise = getVoicesAsync();
    const voices = await voicesPromise;
    if (!isCurrent()) return;

    const preferredVoice = pickVoiceForGender(voices, gender);
    if (preferredVoice) utterance.voice = preferredVoice;

    currentUtterance = utterance;

    if (onBoundary) {
      // Fires per spoken word (charIndex/charLength) in Chrome/Edge.
      utterance.onboundary = (e: SpeechSynthesisEvent) => {
        if (!isCurrent() || currentUtterance !== utterance) return;
        const charLength = (e as unknown as { charLength?: number }).charLength;
        const within = charLength ? e.charIndex + charLength : e.charIndex;
        onBoundary(chunkStart + Math.min(chunk.length, within));
      };
    }

    utterance.onstart = () => {
      if (!isCurrent() || currentUtterance !== utterance) return;
      markTiming('tts-playback-started');
    };

    utterance.onend = () => {
      if (!isCurrent() || currentUtterance !== utterance) return;
      charOffset = chunkStart + chunk.length;
      if (onBoundary) onBoundary(charOffset);
      playNext();
    };

    utterance.onerror = (e) => {
      if (!isCurrent() || currentUtterance !== utterance) return;
      console.error('SpeechSynthesis error:', e);
      onError(e);
    };

    markTiming('tts-request-sent');
    window.speechSynthesis.speak(utterance);
  };

  return {
    push(text: string) {
      if (!isCurrent()) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      queue.push(trimmed);
      if (!playing) playNext();
    },
    end() {
      ended = true;
      if (!playing && queue.length === 0 && isCurrent()) {
        currentUtterance = null;
        onEnd();
      }
    },
  };
}

/**
 * Each chunk is played via a plain <audio> element pointed at a GET URL, so
 * the browser streams and starts playback progressively off its own native
 * HTTP decoder — this avoids MediaSource/SourceBuffer's inconsistent MP3
 * support across browsers while still not waiting for the full file.
 */
function createServerSpeechStream(
  voice: string,
  onEnd: () => void,
  onError: (err: unknown) => void,
  isCurrent: () => boolean,
  onBoundary?: (charIndex: number) => void
): SpeechStreamHandle {
  const queue: string[] = [];
  let ended = false;
  let playing = false;
  let charOffset = 0;

  const playNext = () => {
    if (!isCurrent()) return;

    if (queue.length === 0) {
      playing = false;
      if (ended) {
        currentAudio = null;
        onEnd();
      }
      return;
    }

    playing = true;
    const chunk = queue.shift()!;
    const chunkStart = charOffset;
    const audio = new Audio();
    currentAudio = audio;

    if (onBoundary) {
      audio.ontimeupdate = () => {
        if (!isCurrent() || currentAudio !== audio) return;
        const duration = audio.duration;
        if (!duration || !isFinite(duration)) return;
        const within = Math.min(chunk.length, Math.floor(chunk.length * (audio.currentTime / duration)));
        onBoundary(chunkStart + within);
      };
    }

    audio.onplaying = () => {
      if (!isCurrent() || currentAudio !== audio) return;
      markTiming('tts-playback-started');
    };

    audio.onended = () => {
      if (!isCurrent() || currentAudio !== audio) return;
      charOffset = chunkStart + chunk.length;
      if (onBoundary) onBoundary(charOffset);
      playNext();
    };

    audio.onerror = (e) => {
      if (!isCurrent() || currentAudio !== audio) return;
      console.error('TTS audio playback error:', e);
      onError(e);
    };

    markTiming('tts-request-sent');
    audio.src = ttsUrl(chunk, voice);
    audio.play().catch((err) => {
      if (!isCurrent() || currentAudio !== audio) return;
      onError(err);
    });
  };

  return {
    push(text: string) {
      if (!isCurrent()) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      queue.push(trimmed);
      if (!playing) playNext();
    },
    end() {
      ended = true;
      if (!playing && queue.length === 0 && isCurrent()) {
        currentAudio = null;
        onEnd();
      }
    },
  };
}

export function stopSpeaking() {
  streamId++;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio.ontimeupdate = null;
    currentAudio.onplaying = null;
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio = null;
  }
  if (currentUtterance) {
    currentUtterance.onboundary = null;
    currentUtterance.onstart = null;
    currentUtterance.onend = null;
    currentUtterance.onerror = null;
    currentUtterance = null;
  }
  if (isNativeTTSSupported()) {
    window.speechSynthesis.cancel();
  }
}

// Strips stray stage directions / action text an LLM might slip in despite
// instructions not to (e.g. "*leans forward*") so TTS never reads them aloud.
export function sanitizeForSpeech(text: string): string {
  return text.replace(/\*[^*]*\*/g, '').replace(/\s{2,}/g, ' ').trim();
}

// Greedily splits off complete sentences (ending in ./!/?) from a growing
// buffer of streamed LLM text, so callers can start TTS on each one as soon
// as it's finished rather than waiting for the whole reply. Returns whatever
// trailing, not-yet-terminated text remains as `remainder` for the next call.
const SENTENCE_BOUNDARY_RE = /[^.!?]+[.!?]+(?:\s+|$)/g;

export function extractCompleteSentences(buffer: string): { sentences: string[]; remainder: string } {
  const sentences: string[] = [];
  let lastIndex = 0;
  SENTENCE_BOUNDARY_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SENTENCE_BOUNDARY_RE.exec(buffer))) {
    sentences.push(match[0]);
    lastIndex = SENTENCE_BOUNDARY_RE.lastIndex;
  }
  return { sentences, remainder: buffer.slice(lastIndex) };
}
