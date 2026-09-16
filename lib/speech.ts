// Global type augmentation for Web Speech API window objects
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const MALE_VOICE_HINTS = ['David', 'Daniel', 'Guy', 'Mark', 'Alex', 'Fred', 'George', 'James', 'Ryan', 'Matthew'];
const FEMALE_VOICE_HINTS = ['Zira', 'Samantha', 'Victoria', 'Emma', 'Susan', 'Karen', 'Linda', 'Moira', 'Tessa', 'Google US English'];

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function createSpeechRecognition() {
  if (!isSpeechRecognitionSupported()) {
    return null;
  }
  const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognitionClass();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  return recognition;
}

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

export async function speakText(
  text: string,
  gender: 'male' | 'female' | undefined,
  onEnd?: () => void,
  onError?: (err: any) => void,
  shouldCancel?: () => boolean,
  onBoundary?: (charIndex: number) => void
): Promise<SpeechSynthesisUtterance | null> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    console.warn('SpeechSynthesis is not supported in this browser environment.');
    if (onEnd) onEnd();
    return null;
  }

  // Cancel any ongoing speech synthesis to prevent overlaps
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';

  // Pitch/rate nudge as a fallback so male/female stay audibly distinct even
  // on devices that only expose one or two generic voices.
  if (gender === 'male') {
    utterance.pitch = 0.85;
    utterance.rate = 0.97;
  } else if (gender === 'female') {
    utterance.pitch = 1.15;
    utterance.rate = 1.03;
  } else {
    utterance.pitch = 1.0;
    utterance.rate = 1.0;
  }

  const voices = await getVoicesAsync();

  // The interview may have ended while we were waiting on the async voice
  // list; don't queue speech for a call that's no longer live.
  if (shouldCancel && shouldCancel()) {
    return null;
  }

  const preferredVoice = pickVoiceForGender(voices, gender);

  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  // Fires per spoken word (charIndex/charLength) in Chrome/Edge, letting the
  // caller reveal text in sync with the audio instead of all at once.
  utterance.onboundary = (e: SpeechSynthesisEvent) => {
    if (!onBoundary) return;
    const charLength = (e as any).charLength as number | undefined;
    const revealTo = charLength ? e.charIndex + charLength : e.charIndex;
    onBoundary(revealTo);
  };

  utterance.onend = () => {
    if (onBoundary) onBoundary(text.length);
    if (onEnd) onEnd();
  };

  utterance.onerror = (e) => {
    console.error('SpeechSynthesis error:', e);
    if (onError) onError(e);
    if (onEnd) onEnd();
  };

  window.speechSynthesis.speak(utterance);
  return utterance;
}

export function stopSpeaking() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}
