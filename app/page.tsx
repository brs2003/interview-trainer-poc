'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { RoleSelector } from '@/components/RoleSelector';
import { PersonaInput, Persona, InterviewSessionData } from '@/lib/types';
import { generatePersonaPrompt, buildCandidateSystemPrompt, cleanJsonText } from '@/lib/prompts';

export default function SetupPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [inferredSummary, setInferredSummary] = useState<{ role: string; experience: string } | null>(null);

  const handleStartInterview = async (input: PersonaInput) => {
    setIsLoading(true);
    setError(null);
    setInferredSummary(null);

    try {
      // 1. Generate prompt based on input mode (structured or JD)
      const prompt = generatePersonaPrompt(input);

      const res = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          options: { temperature: 0.7, max_tokens: 1200 },
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to connect to LLM server for persona generation.');
      }

      // 2. Parse persona JSON response with fallback safety
      let persona: Persona;
      const rawText = data.result as string;
      const cleaned = cleanJsonText(rawText);

      try {
        persona = JSON.parse(cleaned) as Persona;
      } catch (parseErr) {
        console.warn('Persona JSON parse error, using fallback:', parseErr, rawText);
        const fallbackRole = input.mode === 'structured' ? input.role : 'Specialist Candidate';
        const fallbackYears = input.mode === 'structured' ? input.experience : '3-5';
        persona = {
          name: `Candidate (${fallbackRole})`,
          background: `Candidate with ${fallbackYears} years of experience relevant to the target requirements.`,
          strengths: [`Core domain operations`, `Technical problem solving`],
          gaps: [`Complex enterprise edge cases`],
          speaking_style: 'Conversational, direct, and professional.',
          gender: 'female',
        };
      }

      // 3. Determine normalized role & experience strings
      let finalRole = input.mode === 'structured' ? input.role : (persona.inferred_role || 'Specialist Candidate');
      let finalYears = input.mode === 'structured' ? input.experience : (persona.inferred_experience || '3-5');

      if (input.mode === 'jd') {
        setInferredSummary({ role: finalRole, experience: finalYears });
      }

      // 4. Build candidate system prompt
      const systemPrompt = buildCandidateSystemPrompt(persona, finalRole, finalYears);

      // 5. Build normalized session data
      const sessionData: InterviewSessionData = {
        role: finalRole,
        years: finalYears,
        persona,
        systemPrompt,
        mode: input.mode,
        jdText: input.mode === 'jd' ? input.jdText : undefined,
        timestamp: Date.now(),
      };

      if (typeof window !== 'undefined') {
        localStorage.setItem('interview_trainer_session', JSON.stringify(sessionData));
      }

      // 6. Navigate to Screen 2 (Voice Call) after brief delay if JD mode (to let user see confirmation)
      if (input.mode === 'jd') {
        setTimeout(() => {
          router.push('/interview');
        }, 1200);
      } else {
        router.push('/interview');
      }
    } catch (err: unknown) {
      console.error('Setup error:', err);
      const msg = err instanceof Error ? err.message : 'Failed to generate persona.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-cream text-olive">
      <Header currentStep={1} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-12 sm:py-20 flex items-center justify-center">
        <RoleSelector
          onStartInterview={handleStartInterview}
          isLoading={isLoading}
          error={error}
          inferredSummary={inferredSummary}
        />
      </main>

      <footer className="py-6 border-t border-hairline text-center text-sm text-muted">
        Interview Trainer &bull; Structured pick & JD-grounded voice simulator
      </footer>
    </div>
  );
}
