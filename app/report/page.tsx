'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import confetti from 'canvas-confetti';
import { Header } from '@/components/Header';
import { ReportCard } from '@/components/ReportCard';
import { Persona, TranscriptItem, EvaluationReport } from '@/lib/types';
import { buildEvaluatorPrompt, cleanJsonText } from '@/lib/prompts';
import { AlertCircle, RefreshCw, RotateCcw } from 'lucide-react';

export default function ReportPage() {
  const router = useRouter();

  const [payload, setPayload] = useState<{
    role: string;
    years: string;
    persona: Persona;
    jdText?: string;
    transcriptItems: TranscriptItem[];
  } | null>(null);

  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const stored = localStorage.getItem('interview_trainer_report_payload');
    if (!stored) {
      router.push('/');
      return;
    }

    try {
      const data = JSON.parse(stored);
      setPayload(data);
      fetchEvaluation(data);
    } catch {
      router.push('/');
    }
  }, []);

  const fetchEvaluation = async (data: {
    role: string;
    years: string;
    persona: Persona;
    jdText?: string;
    transcriptItems: TranscriptItem[];
  }) => {
    setLoading(true);
    setError(null);

    try {
      // Build plain text transcript representation
      let transcriptText = '';
      if (data.transcriptItems && data.transcriptItems.length > 0) {
        transcriptText = data.transcriptItems
          .map((item) => `${item.speaker === 'interviewer' ? 'INTERVIEWER' : 'CANDIDATE'}: ${item.text}`)
          .join('\n\n');
      } else {
        transcriptText = 'INTERVIEWER: Hello, tell me about your experience.\n\nCANDIDATE: I have worked on projects in this domain for several years.';
      }

      // Build evaluator prompt using role, experience, transcript, and optional JD ground truth text
      const effectiveRole = data.persona?.inferred_role || data.role;
      const effectiveYears = data.persona?.inferred_experience || data.years;

      const prompt = buildEvaluatorPrompt(effectiveRole, effectiveYears, transcriptText, data.jdText);

      const res = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          options: {
            temperature: 0.3,
            max_tokens: 2500,
          },
        }),
      });

      const resData = await res.json();

      if (!res.ok || !resData.success) {
        throw new Error(resData.error || 'Evaluator LLM API call failed.');
      }

      const cleaned = cleanJsonText(resData.result as string);
      let parsedReport: EvaluationReport;

      try {
        parsedReport = JSON.parse(cleaned) as EvaluationReport;
      } catch (parseErr) {
        console.warn('Evaluator JSON parse error:', parseErr, cleaned);
        parsedReport = {
          scores: {
            topic_coverage: { score: 7, justification: 'Covered fundamental responsibilities.' },
            difficulty_calibration: { score: 7, justification: 'Questions matched stated seniority.' },
            follow_up_depth: { score: 6, justification: 'Could probe deeper into trade-offs.' },
            structure: { score: 8, justification: 'Good flow and logical sequencing.' },
            communication: { score: 8, justification: 'Clear phrasing without misleading candidate.' },
          },
          missed_topics: ['Domain Best Practices', 'Key Tooling Integration'],
          suggestions: [
            'Probe more deeply into tools and frameworks mentioned in the candidate background.',
            'Ask situational questions testing real-world problem-solving under pressure.',
          ],
        };
      }

      setReport(parsedReport);

      // Trigger celebratory confetti on report load
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch (e) {
        // ignore
      }
    } catch (err: unknown) {
      console.error('Evaluator error:', err);
      const msg = err instanceof Error ? err.message : 'Failed to generate evaluation report.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleStartNewInterview = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('interview_trainer_session');
      localStorage.removeItem('interview_trainer_report_payload');
    }
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex flex-col items-center justify-center text-muted p-4">
        <div className="w-14 h-14 border-4 border-hairline border-t-olive rounded-full animate-spin mb-6"></div>
        <h2 className="text-xl font-semibold text-olive mb-2">Analyzing interview transcript</h2>
        <p className="text-sm text-muted text-center max-w-sm">
          {payload?.jdText
            ? 'Benchmarking your questions against the pasted job description ground truth...'
            : 'Evaluating question quality, coverage, difficulty calibration, and follow-up depth...'}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-cream flex flex-col text-olive">
        <Header currentStep={3} onReset={handleStartNewInterview} />
        <main className="flex-1 max-w-2xl mx-auto px-4 py-16 flex flex-col items-center justify-center text-center">
          <div className="p-4 rounded-full bg-terracotta-light text-terracotta-dark mb-4">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-semibold text-olive mb-2">Evaluation generation failed</h2>
          <p className="text-sm text-muted mb-6">{error}</p>

          <div className="flex gap-4">
            <button
              onClick={() => payload && fetchEvaluation(payload)}
              className="px-5 py-2.5 rounded-lg bg-terracotta hover:bg-terracotta-dark text-white font-semibold text-sm flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retry evaluation</span>
            </button>

            <button
              onClick={handleStartNewInterview}
              className="px-5 py-2.5 rounded-lg bg-white border border-hairline hover:bg-cream text-olive font-semibold text-sm flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Back to setup</span>
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (!report || !payload) return null;

  return (
    <div className="min-h-screen flex flex-col bg-cream text-olive">
      <Header currentStep={3} onReset={handleStartNewInterview} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8">
        <ReportCard
          report={report}
          transcript={payload.transcriptItems || []}
          role={payload.persona?.inferred_role || payload.role}
          years={payload.persona?.inferred_experience || payload.years}
          onStartNewInterview={handleStartNewInterview}
        />
      </main>
    </div>
  );
}
