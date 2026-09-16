export type SetupMode = 'structured' | 'jd';

export type PersonaInput =
  | { mode: 'structured'; role: string; experience: string }
  | { mode: 'jd'; jdText: string };

export interface Persona {
  name: string;
  background: string;
  strengths: string[];
  gaps: string[];
  speaking_style: string;
  gender?: 'male' | 'female';
  inferred_role?: string;
  inferred_experience?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface TranscriptItem {
  id: string;
  speaker: 'interviewer' | 'candidate';
  text: string;
  timestamp: string;
}

export interface DimensionScore {
  score: number;
  justification: string;
}

export interface EvaluationReport {
  scores: {
    topic_coverage: DimensionScore;
    difficulty_calibration: DimensionScore;
    follow_up_depth: DimensionScore;
    structure: DimensionScore;
    communication: DimensionScore;
  };
  missed_topics: string[];
  suggestions: string[];
}

export interface InterviewSessionData {
  role: string;
  years: string;
  persona: Persona;
  systemPrompt: string;
  mode: SetupMode;
  jdText?: string;
  timestamp?: number;
}
