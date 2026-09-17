import { Persona, PersonaInput, InterviewerPersona, CandidateProfile } from './types';

/**
 * Generates prompt for persona creation, supporting both structured pick (Mode A) and raw JD text (Mode B)
 */
export function generatePersonaPrompt(input: PersonaInput): string {
  if (input.mode === 'jd') {
    return `Read the following job description and infer the role title, seniority level, and the key required skills/technologies mentioned. Then generate a realistic candidate persona who would plausibly be interviewing for THIS specific JD.

Job description:
"""
${input.jdText}
"""

Return JSON with: "inferred_role" (the role title you extracted), "inferred_experience" (seniority/years you extracted or reasonably inferred, as a string), "name", "gender" (either "male" or "female", matching the generated name), "background" (2-3 sentences, referencing specifics from the JD where relevant), "strengths" (3-5 areas grounded in skills actually mentioned or implied in the JD), "gaps" (2-3 realistic knowledge gaps appropriate for the inferred seniority — don't make them omniscient, and don't restate the JD's requirements as gaps), and "speaking_style". Output ONLY valid JSON, no markdown fences, no preamble.`;
  }

  return `Generate a realistic candidate persona for a ${input.role} with ${input.experience} years of experience relevant to that role. Return JSON with: "name", "gender" (either "male" or "female", matching the generated name), "background" (2-3 sentences), "strengths" (3-5 areas appropriate for this seniority), "gaps" (2-3 realistic knowledge gaps appropriate for this seniority), and "speaking_style". Keep technical/domain claims accurate and realistic for this role. Output ONLY valid JSON, no markdown fences, no preamble.`;
}

/**
 * System prompt for candidate AI persona
 */
export function buildCandidateSystemPrompt(persona: Persona, fallbackRole: string, fallbackYears: string): string {
  const role = persona.inferred_role || fallbackRole;
  const years = persona.inferred_experience || fallbackYears;
  const strengthsStr = Array.isArray(persona.strengths) ? persona.strengths.join(', ') : String(persona.strengths);
  const gapsStr = Array.isArray(persona.gaps) ? persona.gaps.join(', ') : String(persona.gaps);

  return `You are ${persona.name}, a candidate interviewing for a ${role} position with ${years} years of experience. Background: ${persona.background}. You are strong in: ${strengthsStr}. You have real but realistic gaps in: ${gapsStr}. Speak in this style: ${persona.speaking_style}. Answer interview questions in first person, conversationally, the way a real candidate would speak out loud — 2-4 sentences per answer unless asked to elaborate. Stay strictly in character. Never break persona or mention you are an AI.`;
}

/**
 * System prompt for the interviewer AI persona in role-reversal mode (AI interviews the user)
 */
export function buildInterviewerSystemPrompt(persona: InterviewerPersona, candidate: CandidateProfile): string {
  const tacticsBlock = persona.tactics.length > 0
    ? `\n\nSome example moves that fit your style (use these as inspiration, vary the exact wording, don't recite them verbatim every time):\n${persona.tactics.map((t) => `- ${t}`).join('\n')}`
    : '';

  return `You are ${persona.name}, "${persona.title}" — an interviewer with this
personality: ${persona.traits}. Your difficulty level is ${persona.difficulty}.
Your domain focus is ${persona.domainFocus}.${tacticsBlock}

You are interviewing a candidate for a ${candidate.role} position with
${candidate.experience} years of experience.
${candidate.jdText ? `The job description is: """${candidate.jdText}"""` : ''}
The candidate has told you their strengths are: ${candidate.strengths}.
The candidate has told you their weaknesses are: ${candidate.weaknesses}.

Deliberately probe the candidate's stated weaknesses with follow-up questions — don't
avoid uncomfortable territory, that's the point of this practice session. Match your
questioning style and intensity to your difficulty level and personality above.

IMPORTANT — you cannot convey emotion through audio tone directly, so express your
personality and reactions IN WORDS, as part of what you actually say out loud. Do not
use asterisks, stage directions, or action descriptions — only words a real person
would say out loud.

Ask one question or reaction at a time, in character, 1-3 sentences. Never break
character or mention you are an AI. Begin the interview now with your opening question
— greet the candidate briefly and ask your first question.`;
}

/**
 * Prompt to evaluate the HUMAN CANDIDATE's performance in role-reversal mode
 */
export function buildCandidateEvaluatorPrompt(
  persona: InterviewerPersona,
  candidate: CandidateProfile,
  transcriptText: string
): string {
  let prompt = `You are evaluating a HUMAN CANDIDATE's interview performance based on this transcript, where they were interviewed by a simulated interviewer persona ("${persona.name}", ${persona.title}, difficulty: ${persona.difficulty}) for a ${candidate.role} position with ${candidate.experience} years of experience. The candidate had told the interviewer their strengths were: ${candidate.strengths}. The candidate had told the interviewer their weaknesses were: ${candidate.weaknesses}.

Score the CANDIDATE (not the interviewer) on these dimensions, each 1-10 with a one-sentence justification: communication_clarity (clear, concise, well-organized spoken answers), technical_depth (accuracy and depth of domain knowledge demonstrated), structure_star (did answers to behavioral questions follow a situation/task/action/result structure with concrete outcomes?), weakness_handling (how well did they handle follow-up questions that probed their stated weaknesses — honesty, composure, growth framing), composure (how well did they hold up under the interviewer's pressure and pace, especially for Hard/Brutal difficulty personas). Also return strengths_shown (list of specific strengths the candidate actually demonstrated in their answers), improvement_areas (list of specific weak points in their answers), and suggestions (3-5 concrete, actionable suggestions for how this candidate could improve next time). Output ONLY valid JSON matching this shape: {scores: {communication_clarity: {score, justification}, technical_depth: {score, justification}, structure_star: {score, justification}, weakness_handling: {score, justification}, composure: {score, justification}}, strengths_shown: [...], improvement_areas: [...], suggestions: [...]}. No markdown fences, no preamble.`;

  if (candidate.jdText && candidate.jdText.trim().length > 0) {
    prompt += `\n\nAdditionally, here is the job description this interview was based on — use it as the ground truth for what topics/skills mattered most:\n"""\n${candidate.jdText.trim()}\n"""`;
  }

  prompt += `\n\nTRANSCRIPT:\n${transcriptText}`;

  return prompt;
}

/**
 * Prompt to evaluate interviewer's performance based on transcript and optional JD text
 */
export function buildEvaluatorPrompt(
  role: string,
  years: string,
  transcriptText: string,
  jdText?: string
): string {
  let prompt = `You are evaluating a HUMAN INTERVIEWER's performance based on this interview transcript, where they interviewed a simulated ${role} candidate with ${years} years of experience. Score the INTERVIEWER (not the candidate) on these dimensions, each 1-10 with a one-sentence justification: topic_coverage (did they cover the core skills expected for this role/level?), difficulty_calibration (were questions appropriately scoped to the stated experience level?), follow_up_depth (did they probe vague or surface-level answers?), structure (logical progression, time management), communication (clarity, absence of leading/biased questions). Also return missed_topics (list of important topics for this role/level that were never asked about) and suggestions (3-5 concrete, actionable suggestions for how this interviewer could improve next time). Output ONLY valid JSON matching this shape: {scores: {topic_coverage: {score, justification}, difficulty_calibration: {score, justification}, follow_up_depth: {score, justification}, structure: {score, justification}, communication: {score, justification}}, missed_topics: [...], suggestions: [...]}. No markdown fences, no preamble.`;

  if (jdText && jdText.trim().length > 0) {
    prompt += `\n\nAdditionally, here is the original job description this interview was based on — use it as the ground truth for what topics should have been covered:\n"""\n${jdText.trim()}\n"""`;
  }

  prompt += `\n\nTRANSCRIPT:\n${transcriptText}`;

  return prompt;
}

/**
 * Helper utility to clean raw LLM output strings containing markdown JSON fences
 */
export function cleanJsonText(rawText: string): string {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/, '');
  }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  return cleaned;
}
