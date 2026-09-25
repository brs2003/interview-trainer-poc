// Voice names for OpenRouter's audio speech endpoint, using the Kokoro 82M
// TTS model (hexgrad/kokoro-82m — see lib/openrouterAudio.ts). Kokoro's
// voice IDs are prefixed by accent+gender: "af_"/"am_" (American
// female/male), "bf_"/"bm_" (British female/male). All IDs below were
// verified directly against OpenRouter's /api/v1/audio/speech endpoint.
export const VOICE_IDS = {
  luna: 'af_heart',
  orion: 'am_michael',
  zeus: 'am_fenrir',
  hera: 'af_nova',
  apollo: 'am_echo',
  athena: 'af_sky',
  asteria: 'af_bella',
  hyperion: 'am_adam',
} as const;

// Default voice for the candidate persona (interviewer-practice mode), keyed
// by the gender the persona-generation LLM call assigns it.
export const CANDIDATE_GENDER_VOICE_IDS: Record<'male' | 'female', string> = {
  male: VOICE_IDS.hyperion,
  female: VOICE_IDS.asteria,
};
