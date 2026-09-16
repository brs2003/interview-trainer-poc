'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { VoiceCallPanel } from '@/components/VoiceCallPanel';
import { Persona, TranscriptItem, ChatMessage, InterviewSessionData } from '@/lib/types';

export default function InterviewPage() {
  const router = useRouter();
  const [session, setSession] = useState<InterviewSessionData | null>(null);
  const [loadingSession, setLoadingSession] = useState<boolean>(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('interview_trainer_session');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed.role && parsed.persona && parsed.systemPrompt) {
            setSession(parsed);
          } else {
            router.push('/');
          }
        } catch {
          router.push('/');
        }
      } else {
        router.push('/');
      }
      setLoadingSession(false);
    }
  }, [router]);

  const handleEndInterview = (transcriptItems: TranscriptItem[], chatHistory: ChatMessage[]) => {
    if (typeof window !== 'undefined' && session) {
      const reportPayload = {
        role: session.role,
        years: session.years,
        persona: session.persona,
        jdText: session.jdText,
        transcriptItems,
        chatHistory,
        endedAt: Date.now(),
      };
      localStorage.setItem('interview_trainer_report_payload', JSON.stringify(reportPayload));
    }
    router.push('/report');
  };

  const handleReset = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('interview_trainer_session');
      localStorage.removeItem('interview_trainer_report_payload');
    }
    router.push('/');
  };

  if (loadingSession) {
    return (
      <div className="min-h-screen bg-cream flex flex-col items-center justify-center text-muted">
        <div className="w-10 h-10 border-4 border-hairline border-t-olive rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-medium">Loading candidate session...</p>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-cream text-olive">
      <Header currentStep={2} onReset={handleReset} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8">
        <VoiceCallPanel
          role={session.role as any}
          years={session.years as any}
          persona={session.persona}
          personaSystemPrompt={session.systemPrompt}
          onEndInterview={handleEndInterview}
        />
      </main>
    </div>
  );
}
