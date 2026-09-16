# Interview Trainer PoC

**Interview Trainer PoC** is a Next.js 14 web application designed to train human interviewers. It allows interviewers to practice live voice interviews against an AI-simulated candidate persona and receives a comprehensive, structured evaluation report on the **interviewer's** performance (question quality, technical coverage, difficulty calibration, structure, and follow-up depth).

---

## Architecture Overview & Flow

1. **Screen 1 — Setup (`/`)**:
   - Select technical role (**Data Engineer**, **DevOps Engineer**, **Cloud Engineer**) and seniority level (**2 years**, **3 years**).
   - Generates a realistic candidate persona (background, AWS strengths, knowledge gaps, speaking style) via OpenRouter (`anthropic/claude-sonnet-4.6`).

2. **Screen 2 — Voice Call (`/interview`)**:
   - Hands-free live voice conversation using the browser **Web Speech API** (`SpeechRecognition` / `webkitSpeechRecognition`).
   - Candidate answers spoken aloud using browser **Text-to-Speech** (`window.speechSynthesis`).
   - Microphone automatically resumes listening after candidate finishes speaking.
   - Full interview history is sent on every candidate LLM turn to preserve persona consistency.

3. **Screen 3 — Evaluation Report (`/report`)**:
   - Server-side evaluator LLM prompt scores the **human interviewer** on 5 core dimensions (1-10 with justifications).
   - Highlights missed technical topics and actionable suggestions for improvement.
   - Includes collapsible full interview transcript viewer.

---

## Tech Stack

- **Framework**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Speech-to-Text**: Browser Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`), continuous mode with interim results.
- **Text-to-Speech**: Browser `window.speechSynthesis`.
- **LLM Provider**: OpenRouter API (`anthropic/claude-sonnet-4.6`) via server-side proxy route (`/app/api/llm/route.ts`).
- **Security**: `OPENROUTER_API_KEY` read strictly from `.env.local` server-side, never exposed to client-side JS bundles.

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

- **Browser Compatibility**: The Web Speech API (`SpeechRecognition`) is natively supported in **Google Chrome** and **Microsoft Edge**. On unsupported browsers, an inline warning banner is displayed along with a text input fallback.
- **Voice Quality**: Browser `speechSynthesis` voices vary by OS/browser and may sound robotic.
- **Production Next Steps**:
  - Replace browser STT/TTS with external vendors like **Deepgram** (Speech-to-Text) and **ElevenLabs** / **Cartesia** (Text-to-Speech) for ultra-low-latency, natural voice calls without changing any LLM or prompt logic.
  - Add session persistence (e.g. PostgreSQL / Supabase) to save historical interviewer performance over time.
