'use client';

import React, { useState } from 'react';
import { CandidateEvaluationReport, TranscriptItem, InterviewerPersona } from '@/lib/types';
import { CheckCircle2, ChevronDown, ChevronUp, AlertCircle, MessageSquare, Lightbulb, MessageCircle, BrainCircuit, ListChecks, ShieldQuestion, Gauge, RotateCcw } from 'lucide-react';

interface CandidateReportCardProps {
  report: CandidateEvaluationReport;
  transcript: TranscriptItem[];
  persona: InterviewerPersona;
  role: string;
  years: string;
  onStartNewInterview: () => void;
}

export function CandidateReportCard({
  report,
  transcript,
  persona,
  role,
  years,
  onStartNewInterview,
}: CandidateReportCardProps) {
  const [showTranscript, setShowTranscript] = useState<boolean>(false);

  const scoreKeys: (keyof CandidateEvaluationReport['scores'])[] = [
    'communication_clarity',
    'technical_depth',
    'structure_star',
    'weakness_handling',
    'composure',
  ];

  const totalScore = scoreKeys.reduce((acc, key) => {
    return acc + (report.scores[key]?.score || 0);
  }, 0);

  const averageScore = Number((totalScore / scoreKeys.length).toFixed(1));

  const getGradeInfo = (avg: number) => {
    if (avg >= 8.5) return { grade: 'A+', label: 'Interview-ready' };
    if (avg >= 7.5) return { grade: 'A', label: 'Strong candidate' };
    if (avg >= 6.5) return { grade: 'B', label: 'Solid performance' };
    if (avg >= 5.0) return { grade: 'C', label: 'Developing' };
    return { grade: 'D', label: 'Needs more practice' };
  };

  const gradeInfo = getGradeInfo(averageScore);

  const dimensionTitles: Record<keyof CandidateEvaluationReport['scores'], { title: string; icon: React.ReactNode; desc: string }> = {
    communication_clarity: {
      title: 'Communication clarity',
      icon: <MessageCircle className="w-5 h-5 text-olive" />,
      desc: 'Clear, concise, well-organized spoken answers',
    },
    technical_depth: {
      title: 'Technical depth',
      icon: <BrainCircuit className="w-5 h-5 text-olive" />,
      desc: 'Accuracy and depth of domain knowledge',
    },
    structure_star: {
      title: 'Answer structure',
      icon: <ListChecks className="w-5 h-5 text-olive" />,
      desc: 'Situation / task / action / result with concrete outcomes',
    },
    weakness_handling: {
      title: 'Weakness handling',
      icon: <ShieldQuestion className="w-5 h-5 text-olive" />,
      desc: 'Composure and honesty when your weak spots were probed',
    },
    composure: {
      title: 'Composure under pressure',
      icon: <Gauge className="w-5 h-5 text-olive" />,
      desc: `Holding up against ${persona.name}'s ${persona.difficulty.toLowerCase()} style`,
    },
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 pb-12">

      {/* Hero grade banner */}
      <div className="bg-white border border-hairline rounded-xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div>
          <p className="text-sm font-medium text-muted mb-2">Candidate performance & feedback</p>
          <h1 className="text-2xl sm:text-3xl font-semibold text-olive tracking-tight">
            Your mock interview report
          </h1>
          <p className="text-muted text-sm mt-2">
            Interviewed by <strong className="text-olive">{persona.name}</strong> ({persona.title}, {persona.difficulty}) for: <strong className="text-olive">{role} ({years} yrs)</strong>
          </p>
        </div>

        <div className="flex flex-col items-center justify-center px-8 py-5 rounded-xl bg-cream border border-hairline min-w-[160px]">
          <div className="text-5xl font-semibold text-olive">
            {averageScore}<span className="text-lg text-muted font-normal"> / 10</span>
          </div>
          <div className="mt-2 px-3 py-1 rounded-full text-xs font-semibold bg-terracotta-light text-terracotta-dark">
            {gradeInfo.grade} &middot; {gradeInfo.label}
          </div>
        </div>
      </div>

      {/* 5 Core Evaluation Dimension Cards Grid */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-olive">Dimension scores & feedback</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {scoreKeys.map((key) => {
            const item = report.scores[key];
            const meta = dimensionTitles[key];
            const scoreVal = item?.score || 0;
            const percentage = (scoreVal / 10) * 100;

            return (
              <div
                key={key}
                className="bg-white border border-hairline rounded-xl p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-cream border border-hairline">
                        {meta.icon}
                      </div>
                      <div>
                        <h3 className="font-semibold text-olive text-sm">{meta.title}</h3>
                        <p className="text-xs text-muted">{meta.desc}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl font-semibold text-olive">{scoreVal}</span>
                    <span className="text-sm text-muted">/ 10</span>
                    <div className="flex-1 h-1.5 bg-cream rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-terracotta transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>

                  <p className="text-sm text-muted leading-relaxed">
                    &quot;{item?.justification || 'No justification provided.'}&quot;
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Strengths Shown Section */}
      <div className="bg-white border border-hairline rounded-xl p-6">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="p-2 rounded-lg bg-cream border border-hairline">
            <CheckCircle2 className="w-5 h-5 text-olive" />
          </div>
          <div>
            <h3 className="font-semibold text-olive text-base">Strengths you demonstrated</h3>
            <p className="text-sm text-muted">Specific strengths that came through in your answers</p>
          </div>
        </div>

        {report.strengths_shown && report.strengths_shown.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {report.strengths_shown.map((s, i) => (
              <span
                key={i}
                className="px-3 py-1.5 rounded-lg bg-cream border border-hairline text-olive text-sm font-medium"
              >
                {s}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No specific strengths were called out.</p>
        )}
      </div>

      {/* Improvement Areas Section */}
      <div className="bg-white border border-hairline rounded-xl p-6">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="p-2 rounded-lg bg-cream border border-hairline">
            <AlertCircle className="w-5 h-5 text-olive" />
          </div>
          <div>
            <h3 className="font-semibold text-olive text-base">Areas to improve</h3>
            <p className="text-sm text-muted">Weak points in your answers this session</p>
          </div>
        </div>

        {report.improvement_areas && report.improvement_areas.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {report.improvement_areas.map((topic, i) => (
              <span
                key={i}
                className="px-3 py-1.5 rounded-lg bg-cream border border-hairline text-olive text-sm font-medium"
              >
                {topic}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-olive font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-olive" />
            <span>No major weak points were flagged in this session.</span>
          </p>
        )}
      </div>

      {/* Actionable Suggestions Checklist */}
      <div className="bg-white border border-hairline rounded-xl p-6">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="p-2 rounded-lg bg-cream border border-hairline">
            <Lightbulb className="w-5 h-5 text-olive" />
          </div>
          <div>
            <h3 className="font-semibold text-olive text-base">Actionable suggestions for next time</h3>
            <p className="text-sm text-muted">Concrete ways to sharpen your answers and composure</p>
          </div>
        </div>

        <div className="space-y-3">
          {report.suggestions && report.suggestions.length > 0 ? (
            report.suggestions.map((suggestion, i) => (
              <div
                key={i}
                className="p-4 rounded-lg bg-cream border border-hairline flex items-start gap-3 text-sm text-olive"
              >
                <span className="w-6 h-6 rounded-md bg-white border border-hairline text-olive font-semibold flex items-center justify-center shrink-0 text-xs">
                  {i + 1}
                </span>
                <p className="leading-relaxed mt-0.5">{suggestion}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted">No suggestions returned.</p>
          )}
        </div>
      </div>

      {/* Collapsible Full Transcript Viewer */}
      <div className="bg-white border border-hairline rounded-xl overflow-hidden">
        <button
          onClick={() => setShowTranscript(!showTranscript)}
          className="w-full p-5 flex items-center justify-between text-left hover:bg-cream/60 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <MessageSquare className="w-5 h-5 text-olive" />
            <div>
              <h3 className="font-semibold text-olive text-base">View full interview transcript</h3>
              <p className="text-sm text-muted">{transcript.length} total conversation turns</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm font-medium text-olive">
            <span>{showTranscript ? 'Hide transcript' : 'Show transcript'}</span>
            {showTranscript ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {showTranscript && (
          <div className="p-6 border-t border-hairline bg-cream/40 max-h-[500px] overflow-y-auto custom-scrollbar divide-y divide-hairline">
            {transcript.map((item) => (
              <div
                key={item.id}
                className={`py-4 first:pt-0 text-sm ${
                  item.speaker === 'interviewer' ? 'bg-white -mx-6 px-6 border-l-2 border-terracotta' : ''
                }`}
              >
                <div className="flex items-center justify-between font-medium mb-1 text-muted">
                  <span className="text-olive">{item.speaker === 'interviewer' ? persona.name : 'You (candidate)'}</span>
                  <span className="text-xs text-muted">{item.timestamp}</span>
                </div>
                <p className="leading-relaxed text-olive">{item.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Start New Session CTA */}
      <div className="flex justify-center pt-4">
        <button
          onClick={onStartNewInterview}
          className="py-3.5 px-8 rounded-lg font-semibold text-white bg-terracotta hover:bg-terracotta-dark active:scale-[0.99] transition-all flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Practice another interview session</span>
        </button>
      </div>

    </div>
  );
}
