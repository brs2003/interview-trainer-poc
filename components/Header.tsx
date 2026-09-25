'use client';

import React from 'react';
import Link from 'next/link';
import { RotateCcw } from 'lucide-react';

interface HeaderProps {
  currentStep?: 1 | 2 | 3;
  onReset?: () => void;
}

const NAV_ITEMS: { step: 1 | 2 | 3; label: string; href: string }[] = [
  { step: 1, label: 'Setup', href: '/' },
  { step: 2, label: 'Interview', href: '/interview' },
  { step: 3, label: 'Report', href: '/report' },
];

export function Header({ currentStep = 1, onReset }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-olive px-4 lg:px-8 py-4 print:hidden">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="font-semibold text-lg text-cream tracking-tight">
            Interview Trainer
          </span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          {NAV_ITEMS.map((item) => {
            const isActive = currentStep === item.step;
            const isPast = currentStep > item.step;
            return (
              <span
                key={item.step}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-cream/10 text-cream'
                    : isPast
                    ? 'text-cream/70'
                    : 'text-cream/40'
                }`}
              >
                {item.label}
              </span>
            );
          })}
        </nav>

        {onReset && currentStep > 1 ? (
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 text-sm text-cream/80 hover:text-cream border border-cream/20 hover:border-cream/40 px-3 py-1.5 rounded-md transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New interview</span>
          </button>
        ) : (
          <div className="w-[100px] hidden sm:block" aria-hidden="true" />
        )}
      </div>
    </header>
  );
}
