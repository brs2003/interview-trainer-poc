'use client';

import React from 'react';

interface AvatarProps {
  name: string;
  speaking?: boolean;
  thinking?: boolean;
  size?: 'sm' | 'md';
}

const SIZE_CLASSES: Record<'sm' | 'md', string> = {
  sm: 'w-8 h-8 rounded-lg text-xs',
  md: 'w-12 h-12 rounded-lg text-sm',
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Persona avatar used across both voice panels. `speaking`/`thinking` drive a
// small status badge rather than replacing the initials, so identity stays
// visible while the call is live.
export function Avatar({ name, speaking = false, thinking = false, size = 'sm' }: AvatarProps) {
  return (
    <div
      className={`relative shrink-0 flex items-center justify-center border font-semibold transition-colors ${SIZE_CLASSES[size]} ${
        speaking
          ? 'bg-terracotta-light border-terracotta text-terracotta-dark'
          : 'bg-cream border-hairline text-olive'
      }`}
    >
      {getInitials(name)}

      {speaking && (
        <span className="absolute -bottom-1 -right-1 flex items-end gap-[1.5px] h-3 px-1 py-0.5 rounded-full bg-terracotta border border-white">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-[2px] h-full bg-white rounded-full animate-wave"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </span>
      )}

      {thinking && !speaking && (
        <span className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-muted border border-white animate-pulse" />
      )}
    </div>
  );
}
