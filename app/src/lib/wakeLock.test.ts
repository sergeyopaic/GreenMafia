import { describe, expect, it } from 'vitest';
import { DEFAULT_KEEP_AWAKE, KEEP_AWAKE_MODES, isKeepAwake, wantsWakeLock } from './wakeLock';

describe('режим «Не гасить экран»', () => {
  it('по умолчанию держит экран только во время игры, как и раньше', () => {
    expect(DEFAULT_KEEP_AWAKE).toBe('game');
    expect(wantsWakeLock('game', 'game', true)).toBe(true);
    for (const screen of ['home', 'setup', 'settings', 'players']) expect(wantsWakeLock('game', screen, true)).toBe(false);
  });
  it('«Всегда» держит экран на любом экране, «Никогда» — ни на каком', () => {
    for (const screen of ['home', 'setup', 'game', 'settings']) {
      expect(wantsWakeLock('always', screen, true)).toBe(true);
      expect(wantsWakeLock('never', screen, true)).toBe(false);
    }
  });
  it('вторая вкладка без права на игру никогда не держит экран', () => {
    for (const mode of KEEP_AWAKE_MODES) expect(wantsWakeLock(mode, 'game', false)).toBe(false);
  });
  it('принимает только известные режимы', () => {
    for (const mode of KEEP_AWAKE_MODES) expect(isKeepAwake(mode)).toBe(true);
    for (const raw of ['on', true, null, undefined, 1]) expect(isKeepAwake(raw)).toBe(false);
  });
});
