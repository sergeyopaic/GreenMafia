import { describe, expect, it } from 'vitest';
import legacy from './fixtures/legacy-game.json';
import { decodeHistory, decodePlayers, decodePrefs, decodeSettings, decodeSetup, historyForUpdate, inspectGame } from './saveFormat';
import { runtimeFor } from './gameRuntime';

describe('проверка и миграция формата сохранений', () => {
  it('читает настоящий старый формат без версии и дона, не меняя оригинал', () => {
    const original = structuredClone(legacy);
    for (const raw of [legacy, { ...legacy, schemaVersion: 0 }]) {
      const r = inspectGame(raw);
      expect(r.kind).toBe('ready');
      if (r.kind !== 'ready') throw new Error('Legacy save rejected');
      expect(r.migrated).toBe(true);
      expect(r.dropped).toBe(0);
      expect(r.saved.schemaVersion).toBe(1);
      expect(r.game.state.composition.don).toBe(0);
      expect(r.game.state.settings.timers).toEqual({ speech: 45, defense: 30, lastWord: 60 });
      expect(r.game.state.phase).toEqual({ t: 'discussion', number: 1, index: 0 });
      expect(inspectGame(r.saved)).toMatchObject({ kind: 'ready', migrated: false, dropped: 0 });
    }
    expect(legacy).toEqual(original);
  });

  it('не исполняет журнал неизвестной версии', () => {
    expect(inspectGame({ ...legacy, schemaVersion: 99 })).toEqual({ kind: 'future' });
  });

  it('отделяет отсутствующее сохранение от повреждённого контейнера', () => {
    expect(inspectGame(undefined)).toEqual({ kind: 'missing' });
    for (const raw of [null, [], {}, 'broken', { ...legacy, events: null }, { ...legacy, events: [] }, { ...legacy, createdAt: 'yesterday' }, { ...legacy, schemaVersion: 'one' }]) {
      expect(inspectGame(raw)).toEqual({ kind: 'invalid' });
    }
  });

  it('обрезает только восстанавливаемую копию на первом структурно неверном действии', () => {
    const raw = { ...legacy, events: [...legacy.events, { type: 'CastVotes', counts: { p0: 'five' } }, { type: 'Proceed' }] };
    const before = structuredClone(raw);
    const r = inspectGame(raw);
    expect(r).toMatchObject({ kind: 'ready', dropped: 2 });
    if (r.kind !== 'ready') throw new Error('No valid prefix');
    expect(r.saved.events).toHaveLength(3);
    expect(raw).toEqual(before);
  });

  it('проверяет правила, а не только типы полей журнала', () => {
    const raw = { ...legacy, events: [...legacy.events, { type: 'Nominate', candidate: 'unknown' }, { type: 'Proceed' }] };
    expect(inspectGame(raw)).toMatchObject({ kind: 'ready', dropped: 2 });
    const invalidCreation = structuredClone(legacy);
    invalidCreation.events[0]!.composition!.mafia = 5;
    expect(inspectGame(invalidCreation)).toEqual({ kind: 'invalid' });
    const nullDon = structuredClone(legacy);
    Object.assign(nullDon.events[0]!.composition!, { don: null });
    expect(inspectGame(nullDon)).toEqual({ kind: 'invalid' });
  });

  it('не заменяет явно неверные правила значениями по умолчанию', () => {
    for (const value of [null, { firstNight: 'tomorrow' }, { openSetup: 'yes' }, { timers: { speech: -10 } }, { timers: { speech: NaN } }, { timers: { speech: '60' } }, { doctorSelfHealLimit: -1 }]) {
      expect(decodeSettings(value)).toBeNull();
    }
  });

  it('изолирует повреждённый runtime от журнала правил', () => {
    const r = inspectGame({ ...legacy, runtime: { version: 999, timer: 'bad' } });
    if (r.kind !== 'ready') throw new Error('Bad UI data broke the log');
    expect(runtimeFor(r.game.state, r.saved.runtime, true).timer).toMatchObject({ remainingMs: 45_000, running: false });
  });

  it('проверяет архив при чтении, а при обновлении сохраняет неизменённые записи в старом виде', () => {
    const raw = [structuredClone(legacy)];
    expect(decodeHistory(raw)[0]!.schemaVersion).toBe(1);
    expect(historyForUpdate(raw)).toBe(raw);
    expect(raw[0]!.events[0]!.composition).not.toHaveProperty('don');
    for (const value of [null, [null], [legacy, legacy], [{ ...legacy, events: null }]]) {
      expect(() => decodeHistory(value)).toThrow();
      expect(() => historyForUpdate(value)).toThrow();
    }
    expect(() => decodeHistory([{ ...legacy, events: [...legacy.events, { type: 'Unknown' }] }])).toThrow();
  });

  it('проверяет профили, настройки и подготовку; дополняет только отсутствующие старые поля', () => {
    const setup = { count: 5, names: ['', '', '', '', ''], settings: {}, preset: 'classic', dealing: 'app', composition: legacy.events[0]!.composition };
    expect(decodeSetup(setup).composition!.don).toBe(0);
    expect(decodeSetup(setup).settings.timers.speech).toBe(60);
    for (const raw of [null, { sound: 'on' }, { sound: true, lang: 'xx' }, { sound: true, introSeen: 'yes' }, { sound: true, vibration: 'yes' }, { sound: true, keepAwake: 'on' }]) expect(() => decodePrefs(raw)).toThrow();
    expect(decodePrefs({ sound: false })).toEqual({ sound: false });
    expect(decodePrefs({ sound: true, introSeen: false })).toEqual({ sound: true, introSeen: false });
    expect(decodePrefs({ sound: false, vibration: true })).toEqual({ sound: false, vibration: true });
    expect(decodePrefs({ sound: true, keepAwake: 'always' })).toEqual({ sound: true, keepAwake: 'always' });
    for (const raw of [null, {}, [{ id: 'p', name: 3, createdAt: 1 }], [{ id: 'p', name: 'P', createdAt: 'date' }]]) expect(() => decodePlayers(raw)).toThrow();
    expect(decodePlayers([])).toEqual([]);
    expect(() => decodeSetup({ ...setup, count: '5' })).toThrow();
    expect(() => decodeSetup({ ...setup, seats: [1, 1, 2, 3, 4] })).toThrow();
    expect(() => decodeSetup({ ...setup, settings: null })).toThrow();
  });
});
