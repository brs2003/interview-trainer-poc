'use client';

import React, { useState } from 'react';
import { SetupMode, PersonaInput, Persona } from '@/lib/types';
import { ROLE_GROUPS, EXPERIENCE_RANGES } from '@/lib/roles';
import { ArrowRight, ShieldAlert, FileText, ListFilter, Info, Users, Zap, FileCheck, Lock } from 'lucide-react';

interface RoleSelectorProps {
  onStartInterview: (input: PersonaInput) => Promise<void>;
  isLoading: boolean;
  error?: string | null;
  inferredSummary?: { role: string; experience: string } | null;
}

const TRUST_ITEMS = [
  { icon: Users, label: 'Realistic candidate personas' },
  { icon: Zap, label: 'Instant, structured feedback' },
  { icon: FileCheck, label: 'Grounded in your job description' },
  { icon: Lock, label: 'No signup required' },
];

export function RoleSelector({ onStartInterview, isLoading, error, inferredSummary }: RoleSelectorProps) {
  const [mode, setMode] = useState<SetupMode>('structured');

  // Mode A state
  const [role, setRole] = useState<string>('Data Engineer');
  const [years, setYears] = useState<string>('2-3');

  // Mode B state
  const [jdText, setJdText] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleTabSwitch = (newMode: SetupMode) => {
    setMode(newMode);
    setValidationError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (mode === 'jd') {
      if (!jdText.trim() || jdText.trim().length < 20) {
        setValidationError('Please paste a valid job description (at least 20 characters) with role requirements or skills.');
        return;
      }
      await onStartInterview({ mode: 'jd', jdText: jdText.trim() });
    } else {
      await onStartInterview({ mode: 'structured', role, experience: years });
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Hero heading */}
      <div className="text-center mb-10">
        <h1 className="text-3xl sm:text-5xl font-semibold text-olive tracking-tight leading-tight">
          Practice interviewing, with an AI candidate on the other side
        </h1>
        <p className="text-muted text-base sm:text-lg leading-relaxed mt-4 max-w-2xl mx-auto">
          Pick a role or paste a job description, and get a realistic candidate to interview —
          then receive structured feedback on your technique.
        </p>
      </div>

      {/* Setup card */}
      <div className="bg-white border border-hairline rounded-xl p-6 sm:p-8">
        {/* Mode Switcher Tabs */}
        <div className="flex p-1 rounded-lg bg-cream border border-hairline mb-8">
          <button
            type="button"
            onClick={() => handleTabSwitch('structured')}
            className={`flex-1 py-2.5 px-4 rounded-md font-medium text-sm flex items-center justify-center gap-2 transition-colors ${
              mode === 'structured'
                ? 'bg-olive text-cream'
                : 'text-muted hover:text-olive'
            }`}
          >
            <ListFilter className="w-4 h-4" />
            <span>Choose from list</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabSwitch('jd')}
            className={`flex-1 py-2.5 px-4 rounded-md font-medium text-sm flex items-center justify-center gap-2 transition-colors ${
              mode === 'jd'
                ? 'bg-olive text-cream'
                : 'text-muted hover:text-olive'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Paste a job description</span>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Mode A: Structured Dropdowns */}
          {mode === 'structured' && (
            <div className="space-y-5 animate-fade-in">
              <div>
                <label htmlFor="role-select" className="block text-sm font-medium text-olive mb-2">
                  Target position & domain
                </label>
                <select
                  id="role-select"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-white border border-hairline rounded-lg px-4 py-3 text-base text-olive focus:outline-none focus:border-terracotta focus:ring-1 focus:ring-terracotta cursor-pointer"
                >
                  {ROLE_GROUPS.map((g) => (
                    <optgroup key={g.group} label={g.group}>
                      {g.roles.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="exp-select" className="block text-sm font-medium text-olive mb-2">
                  Seniority range (years of experience)
                </label>
                <select
                  id="exp-select"
                  value={years}
                  onChange={(e) => setYears(e.target.value)}
                  className="w-full bg-white border border-hairline rounded-lg px-4 py-3 text-base text-olive focus:outline-none focus:border-terracotta focus:ring-1 focus:ring-terracotta cursor-pointer"
                >
                  {EXPERIENCE_RANGES.map((range) => (
                    <option key={range} value={range}>
                      {range} {range === '10+' ? 'years (senior / lead)' : 'years of experience'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Mode B: Paste Job Description */}
          {mode === 'jd' && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <label htmlFor="jd-textarea" className="flex items-center justify-between text-sm font-medium text-olive mb-2">
                  <span>Paste the job description</span>
                  <span className="text-xs text-muted font-normal">We'll infer role, seniority & core skills</span>
                </label>
                <textarea
                  id="jd-textarea"
                  value={jdText}
                  onChange={(e) => {
                    setJdText(e.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  rows={7}
                  placeholder="Paste the job description here — role title, responsibilities, required skills, experience level, tools, etc."
                  className="w-full bg-white border border-hairline rounded-lg p-4 text-sm text-olive placeholder-muted/70 focus:outline-none focus:border-terracotta focus:ring-1 focus:ring-terracotta custom-scrollbar leading-relaxed"
                />
              </div>

              <div className="p-3 rounded-lg bg-cream border border-hairline text-sm text-muted flex items-start gap-2.5">
                <Info className="w-4 h-4 text-olive shrink-0 mt-0.5" />
                <span>
                  The candidate persona and final evaluator report will be directly grounded in the skills, tools, and requirements in your pasted JD.
                </span>
              </div>
            </div>
          )}

          {/* Validation or API Error Alerts */}
          {(validationError || error) && (
            <div className="p-4 rounded-lg bg-terracotta-light border border-terracotta/30 text-olive text-sm flex items-start gap-3 animate-shake">
              <ShieldAlert className="w-5 h-5 text-terracotta-dark shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium">Validation error</div>
                <div className="text-muted text-sm mt-0.5">{validationError || error}</div>
              </div>
            </div>
          )}

          {/* Inferred Summary Preview Confirmation */}
          {inferredSummary && (
            <div className="p-4 rounded-lg bg-cream border border-hairline text-sm flex items-center justify-between">
              <span className="text-olive">
                Inferred position: <strong>{inferredSummary.role}</strong> ({inferredSummary.experience})
              </span>
              <span className="text-xs font-medium text-muted">Grounded in JD</span>
            </div>
          )}

          {/* Submit CTA Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 px-6 rounded-lg font-semibold text-white bg-terracotta hover:bg-terracotta-dark active:scale-[0.99] transition-all duration-150 flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>{mode === 'jd' ? 'Reading job description...' : 'Preparing candidate...'}</span>
              </>
            ) : (
              <>
                <span>Start interview practice</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>
      </div>

      {/* How it works / trust row */}
      <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-6">
        {TRUST_ITEMS.map((item) => (
          <div key={item.label} className="flex flex-col items-center text-center gap-2">
            <item.icon className="w-5 h-5 text-olive" strokeWidth={1.75} />
            <span className="text-sm text-muted leading-snug">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
