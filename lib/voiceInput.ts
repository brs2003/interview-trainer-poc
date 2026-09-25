'use client';

import { useEffect, useRef, useState } from 'react';
import { startTurn, markTiming } from './timing';

function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

const BAR_COUNT = 5;
// RMS of the time-domain waveform, not frequency-magnitude — frequency data
// averaged across all 5 UI buckets stays under threshold even during loud
// clear speech, since most buckets cover high-frequency ranges human speech
// barely touches. Time-domain RMS measures actual waveform amplitude and
// doesn't have that blind spot.
const SILENCE_THRESHOLD = 0.02;
// Tier 1 — how long a pause has to hold before the CURRENT recording chunk
// is cut and sent off for transcription. This is purely about keeping
// individual clips short for snappy, incremental transcription; it is NOT
// "the user is done talking" — that's tier 2 below. A single fixed
// stop-and-submit threshold used to conflate the two, so any ordinary
// mid-sentence thinking-pause (very common in a technical interview answer)
// got treated as "answer complete," truncating everything said after it.
const SEGMENT_SILENCE_MS = 700;
// Tier 2 — the real "the user has actually finished this turn" signal.
// Continuously pushed back out (see the tick() loop below) every time real
// voice activity is detected, no matter how many recording chunks that
// speech spans — so the accumulated answer is only submitted once there has
// been this much genuine, unbroken silence, not after the first pause.
const TURN_SILENCE_MS = 2000;
// If tier 2 fires while a chunk's transcription is still in flight, don't
// submit an incomplete answer — wait this long and re-check instead of
// dropping the tail end of what was said.
const FINALIZE_RETRY_DELAY_MS = 400;
const MAX_RECORDING_MS = 30000;
const MIN_BLOB_BYTES = 800;
// MediaRecorder emits a chunk on this cadence (instead of only once at
// stop()) so the RMS/silence tick loop and interim-preview timer can see
// audio as it's captured.
const RECORDER_TIMESLICE_MS = 250;
// How often to fire an interim (best-effort, not authoritative) preview
// transcription of the clip-so-far while the user is still talking.
const INTERIM_TRANSCRIBE_INTERVAL_MS = 1200;
// 128kbps is a reasonable floor for speech; MediaRecorder's own default
// (unset) can fall well below this depending on browser/codec, which
// degrades transcription accuracy independent of which STT model is used.
const AUDIO_BITS_PER_SECOND = 128000;

interface UseVoiceInputOptions {
  // Whether the caller wants the mic live right now (mic toggled on AND
  // nobody else is talking). Flips to false to release the mic immediately.
  active: boolean;
  onTranscript: (text: string) => void;
  // Best-effort, may-be-superseded preview transcript of the in-progress
  // utterance, fired periodically while still recording. Not authoritative —
  // always followed by a final onTranscript once real silence is detected.
  onInterimTranscript?: (text: string) => void;
  onError?: (message: string) => void;
  onPermissionDenied?: () => void;
}

interface VoiceInputState {
  levels: number[];
  isTranscribing: boolean;
}

// STT: records the user's turn as a series of short chunks (each cut and
// transcribed after ~700ms of silence, purely to keep per-request latency
// low), accumulates their transcripts into one running buffer, and only
// hands the COMPLETE buffer to the caller once there's been ~2s of genuine,
// continuous silence with no voice activity at all — reset every time real
// speech is detected, however many chunks it spans. That decoupling is the
// whole point: a single mid-sentence pause (thinking, a breath, composing
// the next clause — all very common in a spoken technical answer) no longer
// gets treated as "the answer is finished," which is what was truncating
// longer answers to whatever was said before the first pause.
export function useVoiceInput({
  active,
  onTranscript,
  onInterimTranscript,
  onError,
  onPermissionDenied,
}: UseVoiceInputOptions): VoiceInputState {
  const [levels, setLevels] = useState<number[]>(() => new Array(BAR_COUNT).fill(0));
  const [isTranscribing, setIsTranscribing] = useState(false);

  const activeRef = useLatestRef(active);
  const onTranscriptRef = useLatestRef(onTranscript);
  const onInterimTranscriptRef = useLatestRef(onInterimTranscript);
  const onErrorRef = useLatestRef(onError);
  const onPermissionDeniedRef = useLatestRef(onPermissionDenied);

  useEffect(() => {
    if (!active || typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setLevels(new Array(BAR_COUNT).fill(0));
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let recorder: MediaRecorder | null = null;
    let rafId: number | null = null;
    let silenceStart: number | null = null;
    let hasDetectedSpeech = false;
    let recordingStart = 0;
    let chunks: Blob[] = [];
    let lastInterimAt = 0;
    let interimInFlight = false;
    let finalizing = false;

    // Turn-level state — persists across every startRecorder() call for as
    // long as this effect (i.e. this continuous "mic is active" session) is
    // alive, unlike the per-segment variables above which reset each chunk.
    let accumulatedText = '';
    let segmentTranscriptionInFlight = false;
    let turnFinalizeTimer: ReturnType<typeof setTimeout> | null = null;
    // Set once the mic is being turned off (or the component unmounts) —
    // distinct from `cancelled`. Unlike a hard cancel, a graceful shutdown
    // still finishes transcribing whatever chunk is currently mid-flight and
    // flushes the accumulated turn instead of discarding it, since "the user
    // clicked the mic off" IS the "turn is over" signal, not a reason to
    // drop what was already captured.
    let shuttingDown = false;

    const clearTurnFinalizeTimer = () => {
      if (turnFinalizeTimer) {
        clearTimeout(turnFinalizeTimer);
        turnFinalizeTimer = null;
      }
    };

    const finishShutdown = () => {
      if (rafId) cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((t) => t.stop());
      audioContext?.close().catch(() => {});
      setLevels(new Array(BAR_COUNT).fill(0));
    };

    const flushTurn = () => {
      turnFinalizeTimer = null;

      // A chunk is still being transcribed — its text isn't in
      // accumulatedText yet, so submitting now would drop the tail end of
      // what was said. Re-check shortly instead of finalizing early.
      if (segmentTranscriptionInFlight) {
        turnFinalizeTimer = setTimeout(flushTurn, FINALIZE_RETRY_DELAY_MS);
        return;
      }

      const text = accumulatedText.trim();
      accumulatedText = '';
      if (text) {
        startTurn('stt-final-result');
        console.log('[voiceInput] turn finalized after silence:', text);
        onTranscriptRef.current(text);
      }
    };

    // Real voice activity (tier 2) — call whenever the RMS tick loop
    // detects the user is actively speaking, regardless of which recording
    // chunk that falls in. Pushes the "turn is over" deadline back out.
    const noteVoiceActivity = () => {
      clearTurnFinalizeTimer();
      turnFinalizeTimer = setTimeout(flushTurn, TURN_SILENCE_MS);
    };

    // Best-effort preview transcription of the current chunk recorded so
    // far, shown as accumulatedText + this in-progress chunk so the user
    // sees the full growing answer, not just the latest fragment.
    // Concatenating every chunk captured since the recorder started forms a
    // syntactically valid (if not yet finalized) WebM/Opus file that the
    // batch endpoint can decode fine even without a closing cue. If this
    // request is slower than the next tick or the chunk finishes first, its
    // result is discarded (superseded) — never sent to /api/llm.
    const fireInterimTranscription = async () => {
      if (interimInFlight || chunks.length === 0 || !recorder) return;
      interimInFlight = true;
      const snapshot = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      markTiming('stt-interim-request-sent');
      try {
        const form = new FormData();
        form.append('audio', snapshot, 'clip.webm');
        const res = await fetch('/api/stt', { method: 'POST', body: form });
        const data = await res.json();
        if (!cancelled && !finalizing && res.ok && data.success) {
          const text = typeof data.transcript === 'string' ? data.transcript.trim() : '';
          const preview = `${accumulatedText} ${text}`.replace(/\s+/g, ' ').trim();
          if (preview) {
            markTiming('stt-interim-result');
            onInterimTranscriptRef.current?.(preview);
          }
        }
      } catch {
        // Best-effort only — the turn-level flush is authoritative.
      } finally {
        interimInFlight = false;
      }
    };

    const startRecorder = () => {
      if (!stream || cancelled) return;

      chunks = [];
      silenceStart = null;
      hasDetectedSpeech = false;
      recordingStart = Date.now();
      lastInterimAt = 0;
      finalizing = false;

      const mimeType = ['audio/webm', 'audio/ogg', 'audio/mp4'].find((t) =>
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)
      );

      recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType, audioBitsPerSecond: AUDIO_BITS_PER_SECOND } : { audioBitsPerSecond: AUDIO_BITS_PER_SECOND }
      );

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        finalizing = true;
        const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' });
        const chunkDurationMs = Date.now() - recordingStart;
        chunks = [];

        if (blob.size < MIN_BLOB_BYTES) {
          // Too short to be real speech (e.g. a brief noise blip) — just
          // start listening again without round-tripping to the server.
          console.log('[voiceInput] chunk discarded (too short):', blob.size, 'bytes');
          if (shuttingDown) {
            flushTurn();
            finishShutdown();
          } else if (activeRef.current) {
            startRecorder();
          }
          return;
        }

        console.log('[voiceInput] sending chunk for transcription:', {
          bytes: blob.size,
          durationMs: chunkDurationMs,
        });

        segmentTranscriptionInFlight = true;
        setIsTranscribing(true);
        try {
          const form = new FormData();
          form.append('audio', blob, 'clip.webm');
          markTiming('stt-request-sent');
          const res = await fetch('/api/stt', { method: 'POST', body: form });
          const data = await res.json();

          if (!res.ok || !data.success) {
            throw new Error(data.error || 'Transcription failed.');
          }

          const text = typeof data.transcript === 'string' ? data.transcript.trim() : '';
          markTiming('stt-final-result');
          console.log('[voiceInput] chunk transcript:', text);
          if (text) {
            accumulatedText = `${accumulatedText} ${text}`.replace(/\s+/g, ' ').trim();
            console.log('[voiceInput] accumulated so far:', accumulatedText);
          }
        } catch (err: unknown) {
          if (!shuttingDown) {
            const msg = err instanceof Error ? err.message : 'Speech-to-text request failed.';
            onErrorRef.current?.(msg);
          }
        } finally {
          segmentTranscriptionInFlight = false;
          setIsTranscribing(false);
          if (shuttingDown) {
            flushTurn();
            finishShutdown();
          } else if (activeRef.current) {
            startRecorder();
          }
        }
      };

      recorder.start(RECORDER_TIMESLICE_MS);
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        audioContext = new AudioContext();
        if (audioContext.state === 'suspended') {
          // Some browsers create a new AudioContext suspended until resumed —
          // left unresumed, the analyser would report all-zero levels forever,
          // which looks exactly like permanent silence.
          await audioContext.resume().catch(() => {});
        }
        const source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);

        const freqData = new Uint8Array(analyser.frequencyBinCount);
        const bucketSize = Math.floor(freqData.length / BAR_COUNT) || 1;
        const timeDomainData = new Uint8Array(analyser.fftSize);

        const tick = () => {
          if (cancelled || !analyser) return;
          analyser.getByteFrequencyData(freqData);

          const next: number[] = [];
          for (let i = 0; i < BAR_COUNT; i++) {
            let sum = 0;
            for (let j = 0; j < bucketSize; j++) sum += freqData[i * bucketSize + j] || 0;
            next.push(Math.min(1, sum / bucketSize / 255));
          }
          setLevels(next);

          analyser.getByteTimeDomainData(timeDomainData);
          let sumSquares = 0;
          for (let i = 0; i < timeDomainData.length; i++) {
            const v = (timeDomainData[i] - 128) / 128;
            sumSquares += v * v;
          }
          const rms = Math.sqrt(sumSquares / timeDomainData.length);
          const now = Date.now();

          if (rms >= SILENCE_THRESHOLD) {
            // Tier 2: real voice activity detected, anywhere in the turn —
            // push the "user is done talking" deadline back out regardless
            // of which recording chunk this falls in.
            noteVoiceActivity();
          }

          if (recorder && recorder.state === 'recording') {
            const elapsed = now - recordingStart;

            if (rms >= SILENCE_THRESHOLD) {
              hasDetectedSpeech = true;
              silenceStart = null;
            } else if (hasDetectedSpeech) {
              // Tier 1: only start THIS CHUNK's cut-and-transcribe countdown
              // after real speech has been heard in it — otherwise the
              // ordinary pause between clicking the mic and actually
              // starting to talk would cut a chunk before anything was said.
              if (silenceStart === null) silenceStart = now;
              if (now - silenceStart > SEGMENT_SILENCE_MS) {
                recorder.stop();
              }
            }

            // Safety net so a long continuous answer (never dipping below the
            // silence threshold) doesn't keep one chunk recording indefinitely.
            if (elapsed > MAX_RECORDING_MS) {
              recorder.stop();
            }

            // Fire an interim preview transcription periodically while the
            // user is still talking, so something starts appearing before
            // the chunk is cut — see fireInterimTranscription() above.
            if (
              hasDetectedSpeech &&
              recorder.state === 'recording' &&
              now - lastInterimAt > INTERIM_TRANSCRIBE_INTERVAL_MS
            ) {
              lastInterimAt = now;
              fireInterimTranscription();
            }
          }

          rafId = requestAnimationFrame(tick);
        };
        tick();

        startRecorder();
      } catch (err: unknown) {
        if (cancelled) return;
        if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
          onPermissionDeniedRef.current?.();
        } else {
          const msg = err instanceof Error ? err.message : 'Microphone access failed.';
          onErrorRef.current?.(msg);
        }
      }
    })();

    return () => {
      cancelled = true;
      shuttingDown = true;
      clearTurnFinalizeTimer();

      // Stopping the mic (or unmounting) mid-utterance used to just drop
      // everything not already flushed — the in-progress chunk's audio and
      // any already-transcribed-but-not-yet-flushed accumulatedText. Instead,
      // stop the recorder and let its onstop handler (above) transcribe that
      // last chunk and flush the full accumulated turn before releasing the
      // mic — see the `shuttingDown` branches in onstop.
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop();
          return;
        } catch {
          // fall through to immediate flush/shutdown below
        }
      }

      flushTurn();
      finishShutdown();
    };
  }, [active]);

  return { levels, isTranscribing };
}
