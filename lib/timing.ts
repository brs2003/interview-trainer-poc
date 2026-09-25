'use client';

// Lightweight per-turn latency instrumentation. One "turn" runs at a time in
// this app (single-in-flight voice call), so a module-level clock is enough —
// no need to thread a turn id through every call site.
let turnStart = 0;
let lastMark = 0;

export function startTurn(label: string) {
  turnStart = performance.now();
  lastMark = turnStart;
  console.debug(`[timing] ▶ ${label} @ +0ms`);
}

export function markTiming(label: string) {
  const now = performance.now();
  const sinceStart = now - turnStart;
  const sinceLast = now - lastMark;
  lastMark = now;
  console.debug(`[timing] ${label} @ +${sinceStart.toFixed(0)}ms (Δ${sinceLast.toFixed(0)}ms)`);
}
