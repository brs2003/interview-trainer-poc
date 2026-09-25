'use client';

import React from 'react';

interface MicWaveformProps {
  active: boolean;
  levels: number[];
}

export function MicWaveform({ active, levels }: MicWaveformProps) {
  return (
    <div className="flex items-end gap-[3px] h-5 w-8 shrink-0" aria-hidden="true">
      {levels.map((level, i) => (
        <span
          key={i}
          className={`flex-1 rounded-full transition-[height] duration-75 ease-out ${
            active ? 'bg-terracotta' : 'bg-hairline'
          }`}
          style={{ height: `${active ? Math.max(15, level * 100) : 15}%` }}
        />
      ))}
    </div>
  );
}
