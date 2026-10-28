import type { Phase } from '@greenmafia/engine';

export const SFX_NAMES = ['night-fall', 'morning', 'stamp', 'chip', 'typewriter', 'tick', 'time-up', 'envelope', 'win-town', 'win-mafia', 'win-maniac'] as const;
export type Sfx = (typeof SFX_NAMES)[number];

/** Choices, checks and role status must never create audible night information. */
export function mayPlaySound(name: Sfx, phase: Phase['t'] | null, paused: boolean): boolean {
  if (paused) return false;
  if (phase === 'night') return name === 'night-fall' || name === 'morning';
  if (phase === 'reveal') return name === 'envelope';
  return true;
}

/** Haptics can expose a silent night action just as clearly as sound. */
export function mayVibrate(phase: Phase['t'] | null, paused: boolean): boolean {
  return !paused && phase !== 'night' && phase !== 'reveal';
}
