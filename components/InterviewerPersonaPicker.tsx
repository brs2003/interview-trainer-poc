'use client';

import React, { useState } from 'react';
import { InterviewerPersona } from '@/lib/types';
import { INTERVIEWER_PERSONAS, DIFFICULTY_VOICE_DEFAULTS } from '@/lib/interviewerPersonas';
import { Check, Sparkles } from 'lucide-react';

interface InterviewerPersonaPickerProps {
  selectedId: string | null;
  onSelect: (persona: InterviewerPersona) => void;
  candidateRole: string;
}

const DIFFICULTY_STYLES: Record<InterviewerPersona['difficulty'], string> = {
  Easy: 'bg-cream text-olive border-hairline',
  Medium: 'bg-cream text-olive border-hairline',
  Hard: 'bg-terracotta-light text-terracotta-dark border-terracotta/30',
  Brutal: 'bg-terracotta text-white border-terracotta-dark',
};

export function InterviewerPersonaPicker({ selectedId, onSelect, candidateRole }: InterviewerPersonaPickerProps) {
  const [customName, setCustomName] = useState<string>('');
  const [customDifficulty, setCustomDifficulty] = useState<InterviewerPersona['difficulty']>('Medium');
  const [customDescription, setCustomDescription] = useState<string>('');

  const isCustomSelected = selectedId === 'custom';

  const emitCustomPersona = (
    name: string,
    difficulty: InterviewerPersona['difficulty'],
    description: string
  ) => {
    const persona: InterviewerPersona = {
      id: 'custom',
      name: name.trim() || 'Your Interviewer',
      title: 'Custom',
      difficulty,
      domainFocus: candidateRole,
      traits: description.trim() || 'A balanced interviewer with no further specifics provided.',
      tactics: [],
      voice: DIFFICULTY_VOICE_DEFAULTS[difficulty],
    };
    onSelect(persona);
  };

  const handleCustomFieldChange = (field: 'name' | 'difficulty' | 'description', value: string) => {
    let nextName = customName;
    let nextDifficulty = customDifficulty;
    let nextDescription = customDescription;

    if (field === 'name') {
      nextName = value;
      setCustomName(value);
    } else if (field === 'difficulty') {
      nextDifficulty = value as InterviewerPersona['difficulty'];
      setCustomDifficulty(nextDifficulty);
    } else {
      nextDescription = value;
      setCustomDescription(value);
    }

    emitCustomPersona(nextName, nextDifficulty, nextDescription);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {INTERVIEWER_PERSONAS.map((persona) => {
          const isSelected = selectedId === persona.id;
          return (
            <button
              key={persona.id}
              type="button"
              onClick={() => onSelect(persona)}
              className={`text-left p-4 rounded-lg border transition-colors relative ${
                isSelected
                  ? 'border-terracotta bg-terracotta-light/40 ring-1 ring-terracotta'
                  : 'border-hairline bg-white hover:border-terracotta/50'
              }`}
            >
              {isSelected && (
                <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-terracotta text-white flex items-center justify-center">
                  <Check className="w-3 h-3" />
                </div>
              )}
              <div className="flex items-center gap-2 mb-1.5 pr-6">
                <span className="font-semibold text-olive text-sm">{persona.name}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-md border ${DIFFICULTY_STYLES[persona.difficulty]}`}>
                  {persona.difficulty}
                </span>
              </div>
              <p className="text-xs font-medium text-muted mb-1.5">{persona.title}</p>
              <p className="text-xs text-muted leading-relaxed">{persona.traits}</p>
              <p className="text-xs text-muted/80 mt-1.5">{persona.domainFocus}</p>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => emitCustomPersona(customName, customDifficulty, customDescription)}
          className={`text-left p-4 rounded-lg border transition-colors relative ${
            isCustomSelected
              ? 'border-terracotta bg-terracotta-light/40 ring-1 ring-terracotta'
              : 'border-hairline bg-white hover:border-terracotta/50'
          }`}
        >
          {isCustomSelected && (
            <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-terracotta text-white flex items-center justify-center">
              <Check className="w-3 h-3" />
            </div>
          )}
          <div className="flex items-center gap-2 mb-1.5 pr-6">
            <Sparkles className="w-3.5 h-3.5 text-olive" />
            <span className="font-semibold text-olive text-sm">Custom</span>
          </div>
          <p className="text-xs font-medium text-muted mb-1.5">Build your own</p>
          <p className="text-xs text-muted leading-relaxed">
            Describe your own interviewer's personality, focus, and toughness.
          </p>
        </button>
      </div>

      {isCustomSelected && (
        <div className="p-4 rounded-lg bg-cream border border-hairline space-y-4 animate-fade-in">
          <div>
            <label htmlFor="custom-interviewer-name" className="block text-sm font-medium text-olive mb-1.5">
              Name <span className="text-muted font-normal">(optional)</span>
            </label>
            <input
              id="custom-interviewer-name"
              type="text"
              value={customName}
              onChange={(e) => handleCustomFieldChange('name', e.target.value)}
              placeholder="Your Interviewer"
              className="w-full bg-white border border-hairline rounded-lg px-4 py-2.5 text-sm text-olive placeholder-muted/70 focus:outline-none focus:border-terracotta focus:ring-1 focus:ring-terracotta"
            />
          </div>

          <div>
            <label htmlFor="custom-interviewer-difficulty" className="block text-sm font-medium text-olive mb-1.5">
              Difficulty
            </label>
            <select
              id="custom-interviewer-difficulty"
              value={customDifficulty}
              onChange={(e) => handleCustomFieldChange('difficulty', e.target.value)}
              className="w-full bg-white border border-hairline rounded-lg px-4 py-2.5 text-sm text-olive focus:outline-none focus:border-terracotta focus:ring-1 focus:ring-terracotta cursor-pointer"
            >
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
              <option value="Brutal">Brutal</option>
            </select>
          </div>

          <div>
            <label htmlFor="custom-interviewer-description" className="block text-sm font-medium text-olive mb-1.5">
              Personality description
            </label>
            <textarea
              id="custom-interviewer-description"
              value={customDescription}
              onChange={(e) => handleCustomFieldChange('description', e.target.value)}
              rows={3}
              placeholder="Describe how this interviewer should behave, what they focus on, and how tough they should be."
              className="w-full bg-white border border-hairline rounded-lg p-3 text-sm text-olive placeholder-muted/70 focus:outline-none focus:border-terracotta focus:ring-1 focus:ring-terracotta leading-relaxed"
            />
          </div>
        </div>
      )}
    </div>
  );
}
