import { describe, expect, it } from 'vitest';
import { CLASSIC_SETTINGS, PRESETS } from '@greenmafia/engine';
import {
  MAX_PROFILE_NAME,
  MAX_RULE_PROFILES,
  createProfile,
  decodeRuleProfiles,
  matchProfile,
  profileNameError,
  removeProfile,
  renameProfile,
  sameSettings,
  updateProfileRules,
} from './ruleProfiles';

const reserved = ['Классика', 'Спортивная', 'Своя', 'Classic', 'Sports', 'Custom'];
const fast = { ...CLASSIC_SETTINGS, timers: { ...CLASSIC_SETTINGS.timers, speech: 30 } };

describe('профили правил', () => {
  it('сохраняет копию правил, переименовывает, обновляет и удаляет', () => {
    let list = createProfile([], '  Наш   клуб ', fast, 10);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'Наш клуб', createdAt: 10, updatedAt: 10 });
    fast.timers.speech = 99; // the profile keeps its own copy
    expect(list[0]!.settings.timers.speech).toBe(30);
    fast.timers.speech = 30;
    const id = list[0]!.id;
    list = renameProfile(list, id, 'Быстрая игра', 20);
    expect(list[0]).toMatchObject({ name: 'Быстрая игра', updatedAt: 20 });
    list = updateProfileRules(list, id, PRESETS.sports, 30);
    expect(sameSettings(list[0]!.settings, PRESETS.sports)).toBe(true);
    expect(removeProfile(list, id)).toEqual([]);
  });

  it('узнаёт выбранный профиль независимо от порядка ключей', () => {
    const list = createProfile([], 'Быстро', fast);
    const reordered = Object.fromEntries(Object.entries(structuredClone(fast)).reverse()) as typeof fast;
    expect(matchProfile(list, reordered)?.name).toBe('Быстро');
    expect(matchProfile(list, CLASSIC_SETTINGS)).toBeUndefined();
  });

  it('проверяет названия: пустые, повторы, стандартные наборы и лимит', () => {
    const list = createProfile([], 'Наш клуб', fast);
    expect(profileNameError(list, '   ', reserved)).toBe('empty');
    expect(profileNameError(list, 'наш  КЛУБ', reserved)).toBe('exists');
    expect(profileNameError(list, 'Наш клуб', reserved, list[0]!.id)).toBeNull(); // renaming to itself
    for (const name of ['классика', 'Sports', ' custom ']) expect(profileNameError(list, name, reserved)).toBe('reserved');
    expect(profileNameError(list, 'Турнир', reserved)).toBeNull();
    let full: ReturnType<typeof createProfile> = [];
    for (let i = 0; i < MAX_RULE_PROFILES; i++) full = createProfile(full, `Профиль ${i}`, fast);
    expect(profileNameError(full, 'Ещё один', reserved)).toBe('full');
    expect(profileNameError(full, 'Новое имя', reserved, full[0]!.id)).toBeNull(); // renaming is still allowed
  });

  it('строго проверяет сохранённые и импортированные профили', () => {
    const good = createProfile([], 'Наш клуб', fast, 5);
    expect(decodeRuleProfiles(structuredClone(good))).toEqual(good);
    const base = good[0]!;
    for (const raw of [
      null,
      {},
      [{ ...base, name: '' }],
      [{ ...base, name: 'x'.repeat(MAX_PROFILE_NAME + 1) }],
      [{ ...base, id: 3 }],
      [{ ...base, createdAt: 'вчера' }],
      [{ ...base, settings: { tieRule: 'дуэль' } }],
      [base, { ...base, name: 'Другой' }], // same id twice
      [base, { ...base, id: 'other', name: 'НАШ КЛУБ' }], // same name twice
      Array.from({ length: MAX_RULE_PROFILES + 1 }, (_, i) => ({ ...base, id: `p${i}`, name: `П${i}` })),
    ]) expect(() => decodeRuleProfiles(raw)).toThrow();
    // Missing rules are filled from the classic set, like any older saved settings.
    expect(decodeRuleProfiles([{ ...base, settings: { tieRule: 'nobody' } }])[0]!.settings).toEqual({ ...CLASSIC_SETTINGS, tieRule: 'nobody' });
  });
});
