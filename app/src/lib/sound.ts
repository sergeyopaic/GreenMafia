// Sound effects and vibration (GAME_DESIGN.md §17.2). Missing files are silently skipped.
// Rule: at night only neutral sounds (night start / morning), never tied to a specific choice.

import { asset } from './assets';

export type Sfx =
  | 'night-fall'
  | 'morning'
  | 'stamp'
  | 'chip'
  | 'typewriter'
  | 'tick'
  | 'time-up'
  | 'envelope'
  | 'win-town'
  | 'win-mafia'
  | 'win-maniac';

let enabled = true;
const cache = new Map<string, HTMLAudioElement>();

export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

export function play(name: Sfx, volume = 0.8): void {
  if (!enabled) return;
  const url = asset(`audio/sfx/${name}`, 'audio');
  if (!url) return;
  let el = cache.get(url);
  if (!el) {
    el = new Audio(url);
    cache.set(url, el);
  }
  el.volume = volume;
  el.currentTime = 0;
  el.play().catch(() => {});
}

export function vibrate(pattern: number | number[]): void {
  if (!enabled) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}
