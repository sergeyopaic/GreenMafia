import { describe, expect, it } from 'vitest';
import { mayPlaySound, SFX_NAMES } from './soundPolicy';

describe('секретность звука', () => {
  it('ночью допускает только общие границы фазы', () => {
    expect(SFX_NAMES.filter((name) => mayPlaySound(name, 'night', false))).toEqual(['night-fall', 'morning']);
  });
  it('при раздаче разрешает одинаковый звук конверта для всех ролей', () => {
    expect(SFX_NAMES.filter((name) => mayPlaySound(name, 'reveal', false))).toEqual(['envelope']);
  });
  it('на паузе запрещает все сигналы', () => {
    for (const name of SFX_NAMES) expect(mayPlaySound(name, 'discussion', true)).toBe(false);
  });
  it('днём допускает сигналы таймера и голосов', () => {
    for (const name of ['tick', 'time-up', 'chip'] as const) expect(mayPlaySound(name, 'discussion', false)).toBe(true);
  });
});
