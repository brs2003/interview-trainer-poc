# Interview Trainer PoC

**Interview Trainer PoC** is a Next.js 14 web application designed to train human interviewers. It allows interviewers to practice live voice interviews against an AI-simulated candidate persona and receives a comprehensive, structured evaluation report on the **interviewer's** performance (question quality, technical coverage, difficulty calibration, structure, and follow-up depth).

---

## Architecture Overview & Flow

1. **Screen 1 — Setup (`/`)**:
   - Select technical role (**Data Engineer**, **DevOps Engineer**, **Cloud Engineer**) and seniority level (**2 years**, **3 years**).
   - Generates a realistic candidate persona (background, AWS strengths, knowledge gaps, speaking style) via OpenRouter (`anthropic/claude-sonnet-4.6`).

2. **Screen 2 — Voice Call (`/interview`)**:
   - Hands-free live voice conversation. The mic records via `MediaRecorder`, auto-stopping each utterance on ~600ms of silence (client-side RMS audio-level detection), and the complete clip is transcribed in one request via **OpenRouter's audio transcription endpoint**, using `openai/whisper-large-v3-turbo`.
   - The candidate/interviewer persona answers aloud using **OpenRouter's audio speech endpoint** (`hexgrad/kokoro-82m`), with the transcript revealed on an estimated schedule proportional to audio playback progress.
   - Microphone automatically resumes listening after the persona finishes speaking.
   - Full interview history is sent on every LLM turn to preserve persona consistency.

3. **Screen 3 — Evaluation Report (`/report`)**:
   - Server-side evaluator LLM prompt scores the **human interviewer** on 5 core dimensions (1-10 with justifications).
   - Highlights missed technical topics and actionable suggestions for improvement.
   - Includes collapsible full interview transcript viewer.

---

## Tech Stack

- **Framework**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Speech-to-Text**: OpenRouter's `/api/v1/audio/transcriptions` endpoint (`openai/whisper-large-v3-turbo`), via server-side proxy route (`/app/api/stt/route.ts`). The client records each utterance with `MediaRecorder`, auto-stops on silence, and sends the complete clip as a single request (`lib/voiceInput.ts`) — deliberately not the browser's native Web Speech API, which finalizes continuous recognition phrase-by-phrase rather than once per utterance and was truncating/garbling longer answers.
- **Text-to-Speech**: OpenRouter's `/api/v1/audio/speech` endpoint (`hexgrad/kokoro-82m`), via server-side proxy route (`/app/api/tts/route.ts`). Playback + estimated transcript reveal handled in `lib/voiceOutput.ts`.
- **LLM Provider**: OpenRouter API (`anthropic/claude-sonnet-4.6`) via server-side proxy route (`/app/api/llm/route.ts`).
- **Security**: `OPENROUTER_API_KEY` is the only credential needed — it's read strictly from `.env.local` server-side, never exposed to client-side JS bundles, and covers chat, transcription, and speech synthesis.

---

## Getting Started

### 1. Installation
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.local.example` to `.env.local` and add your OpenRouter API key:
```bash
OPENROUTER_API_KEY=sk-or-v1-...
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in Google Chrome or Microsoft Edge.

---

## Browser Support & Known Limitations

- **Browser Compatibility**: Mic capture uses `MediaRecorder` + `getUserMedia`, which is broadly supported (Chrome, Edge, Firefox, Safari). On unsupported browsers, an inline warning banner is displayed along with a text input fallback.
- **Voice latency**: each answer is recorded, silence-detected, transcribed, and synthesized as discrete request/response steps rather than a continuous low-latency stream — there's a brief "Transcribing…" pause after speaking and before the reply starts playing, in exchange for keeping the API key server-side with no extra streaming infrastructure.
- **TTS transcript sync is approximate**: OpenRouter's speech endpoint returns raw audio with no word/character timing data, so the "typing" reveal is paced proportionally to audio duration rather than truly word-synced.
- **Production Next Steps**:
  - Move to real-time streaming STT (a dedicated STT vendor + a short-lived scoped key + a browser WebSocket) if live word-by-word captions become worth the added complexity.
  - Go directly to a dedicated STT/TTS vendor (e.g. Deepgram, ElevenLabs) instead of proxying through OpenRouter, for lower latency or a wider voice/model selection, if OpenRouter's audio endpoints aren't enough down the line.
  - Add session persistence (e.g. PostgreSQL / Supabase) to save historical interviewer performance over time.
