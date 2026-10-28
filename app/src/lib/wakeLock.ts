// "Keep screen on" preference: when the app asks the phone not to dim and lock the screen.

export type KeepAwake = 'game' | 'always' | 'never';

/** Order of the choices in Settings; `game` is the default. */
export const KEEP_AWAKE_MODES: readonly KeepAwake[] = ['game', 'always', 'never'];
export const DEFAULT_KEEP_AWAKE: KeepAwake = 'game';

export const isKeepAwake = (v: unknown): v is KeepAwake => KEEP_AWAKE_MODES.includes(v as KeepAwake);

/**
 * Whether the screen should stay on right now.
 * Only the tab that owns the game holds the lock, so a second open tab never keeps the phone awake.
 */
export function wantsWakeLock(mode: KeepAwake, screen: string, owner: boolean): boolean {
  if (!owner) return false;
  if (mode === 'always') return true;
  if (mode === 'game') return screen === 'game';
  return false;
}

/** The browser supports the Screen Wake Lock API (Safari 16.4+, Chrome 84+). */
export const wakeLockSupported = (): boolean => typeof navigator !== 'undefined' && 'wakeLock' in navigator;
