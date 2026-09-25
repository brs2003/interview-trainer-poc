// STT/TTS via OpenRouter's unified audio endpoints — same OPENROUTER_API_KEY
// as the chat completions calls in lib/openrouter.ts, no separate provider
// account needed. Docs: https://openrouter.ai/docs/guides/overview/multimodal
//
// STT transcribes one complete recorded utterance per request (see
// lib/voiceInput.ts) rather than assembling many fragmented live-recognition
// events — window.SpeechRecognition finalizes continuous speech phrase by
// phrase, and the app previously (incorrectly) treated each fragment as a
// complete turn, dropping or truncating longer answers. A single-shot
// transcription of the whole clip doesn't have that failure mode.

// Whisper Large V3 Turbo: fastest/cheapest good-quality STT OpenRouter
// offers ($0.000003/s, ~216x realtime factor).
export const OPENROUTER_STT_MODEL = 'openai/whisper-large-v3-turbo';
// Kokoro 82M: a small, fast open TTS model — measured ~0.6-1.1s to first
// audio byte via OpenRouter for a short sentence, faster than both
// deepgram/aura-2 (~1.9s) and google/gemini-3.1-flash-tts-preview (~3.4s+)
// tried before it. Natively supports response_format: "mp3".
export const OPENROUTER_TTS_MODEL = 'hexgrad/kokoro-82m';

const TRANSCRIPTIONS_URL = 'https://openrouter.ai/api/v1/audio/transcriptions';
const SPEECH_URL = 'https://openrouter.ai/api/v1/audio/speech';

function requireApiKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('OPENROUTER_API_KEY is missing or invalid in server environment. Please configure .env.local.');
  }
  return apiKey.trim();
}

async function readErrorDetail(response: Response, providerLabel: string): Promise<string> {
  const errorText = await response.text();
  try {
    const errJson = JSON.parse(errorText);
    if (errJson.error?.message) return `${providerLabel} Error: ${errJson.error.message}`;
  } catch {
    // not JSON
  }
  return errorText
    ? `${providerLabel} Error (${response.status}): ${errorText}`
    : `${providerLabel} API request failed with status ${response.status}`;
}

/**
 * Transcribes a complete recorded audio clip in one request via OpenRouter's
 * audio transcription endpoint (Whisper Large V3 Turbo). `format` should
 * match the clip's container, e.g. "webm", "ogg", "m4a", "mp3", "wav".
 */
export async function transcribeWithOpenRouter(base64Audio: string, format: string): Promise<string> {
  const apiKey = requireApiKey();

  const response = await fetch(TRANSCRIPTIONS_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENROUTER_STT_MODEL,
      input_audio: { data: base64Audio, format },
      response_format: 'json',
      language: 'en',
      // Deterministic decoding — reduces run-to-run variance on ambiguous
      // audio compared to Whisper's default sampling temperature.
      temperature: 0,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorDetail(response, 'OpenRouter Transcription'));
  }

  const data = await response.json();
  return typeof data.text === 'string' ? data.text : '';
}

export interface OpenRouterSpeechStream {
  body: ReadableStream<Uint8Array>;
  contentType: string;
}

/**
 * Synthesizes speech via OpenRouter's audio speech endpoint (Kokoro 82M).
 * Pipes the upstream response body straight through rather than buffering
 * the whole file first, so if/when the provider emits audio bytes
 * progressively during synthesis, callers can start playback before the
 * full clip is done generating. This endpoint has no character/word timing
 * alignment, unlike some dedicated TTS providers, so callers reveal
 * transcript text on an estimated (duration-proportional) schedule instead.
 */
export async function synthesizeWithOpenRouterStream(text: string, voice: string): Promise<OpenRouterSpeechStream> {
  const apiKey = requireApiKey();

  const response = await fetch(SPEECH_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENROUTER_TTS_MODEL,
      input: text,
      voice,
      response_format: 'mp3',
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorDetail(response, 'OpenRouter Speech'));
  }

  if (!response.body) {
    throw new Error('OpenRouter Speech response did not include a readable body.');
  }

  const contentType = response.headers.get('content-type') || 'audio/mpeg';

  return { body: response.body, contentType };
}
