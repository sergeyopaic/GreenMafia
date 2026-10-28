import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLASSIC_SETTINGS, emptyComposition, type CreateGameEvent, type Role } from '@greenmafia/engine';
import { get, set, setMany } from 'idb-keyval';
import type { SavedGame } from './lib/storage';
import legacy from './lib/fixtures/legacy-game.json';

const memory = vi.hoisted(() => new Map<unknown, unknown>());
vi.mock('idb-keyval', () => ({ get: vi.fn(), set: vi.fn(), setMany: vi.fn(), del: vi.fn(), update: vi.fn() }));
vi.mock('./lib/sound', () => ({ setSoundContext: vi.fn(), setSoundEnabled: vi.fn(), setVibrationEnabled: vi.fn() }));
vi.mock('./lib/tabOwnership', () => ({ mayWrite: () => true }));

let now: number;
let monotonic: number;

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  memory.clear();
  now = 1_000_000;
  monotonic = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(performance, 'now').mockImplementation(() => monotonic += 500);
  vi.stubGlobal('window', { scrollTo: vi.fn() });
  vi.mocked(get).mockImplementation(async (key) => structuredClone(memory.get(key)));
  vi.mocked(set).mockImplementation(async (key, value) => { memory.set(key, structuredClone(value)); });
  vi.mocked(setMany).mockImplementation(async (entries) => {
    for (const [key, value] of entries) memory.set(key, structuredClone(value));
  });
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function creation(): CreateGameEvent {
  const roles: Role[] = ['mafia', 'commissar', 'civilian', 'civilian', 'civilian'];
  const composition = emptyComposition();
  for (const role of roles) composition[role]++;
  return {
    type: 'CreateGame', dealing: 'cards', roles, composition,
    settings: { ...CLASSIC_SETTINGS, timers: { ...CLASSIC_SETTINGS.timers } },
    players: roles.map((_, i) => ({ id: `p${i}`, name: `P${i}` })),
  };
}

async function setup(voting = false) {
  const { useApp } = await import('./store');
  const { flushStorage } = await import('./lib/persistence');
  const app = () => useApp.getState();
  expect(app().startGame(creation())).toBe(true);
  expect(app().dispatch({ type: 'Proceed' })).toBe(true); // Meeting → morning.
  expect(app().dispatch({ type: 'Proceed' })).toBe(true); // Morning → first speech.
  if (voting) {
    expect(app().dispatch({ type: 'Nominate', candidate: 'p1' })).toBe(true);
    expect(app().dispatch({ type: 'Proceed' })).toBe(true);
    expect(app().dispatch({ type: 'Nominate', candidate: 'p2' })).toBe(true);
    for (let i = 0; i < 4; i++) expect(app().dispatch({ type: 'Proceed' })).toBe(true);
    expect(app().game!.state.phase.t).toBe('voting');
  }
  await flushStorage();
  return { useApp, app, flushStorage };
}

describe('сохранение живой партии через store', () => {
  it('после перезапуска восстанавливает журнал и незавершённые голоса на паузе', async () => {
    const { useApp, app, flushStorage } = await setup(true);
    app().updateVotingDraft((draft) => ({ ...draft, votes: { p1: ['p0', 'p3'], p2: ['p4'] }, counts: { p1: 2, p2: 1 }, page: 1, quick: true }));
    await flushStorage();
    const saved = structuredClone(memory.get('gm.current')) as SavedGame;
    // Recreate application modules while keeping the independently cloned database.
    vi.resetModules();
    const restarted = (await import('./store')).useApp;
    await restarted.getState().init();
    await restarted.getState().resume();
    await (await import('./lib/persistence')).flushStorage();
    expect(restarted.getState().game!.events).toEqual(saved.events);
    expect(restarted.getState().runtime!.voting).toEqual(saved.runtime!.voting);
    expect(restarted.getState().paused).toBe(true);
    expect(restarted.getState().gameId).toBe(useApp.getState().gameId);
  });

  it('пауза, выход и продолжение сохраняют остаток; сброс сохраняется тоже', async () => {
    const { app, flushStorage } = await setup();
    app().toggleTimer();
    now += 17_500;
    app().go({ name: 'home' });
    expect(app().paused).toBe(true);
    expect(app().runtime!.timer!.remainingMs).toBe(42_500);
    app().closeGame();
    await flushStorage();
    now += 300_000;
    await app().resume();
    expect(app().runtime!.timer!.remainingMs).toBe(42_500);
    expect(app().runtime!.timer!.deadline).toBeNull();
    app().setPaused(false);
    expect(app().runtime!.timer!.deadline).toBe(now + 42_500);
    now += 2500;
    app().toggleTimer();
    expect(app().runtime!.timer!.remainingMs).toBe(40_000);
    expect(app().runtime!.timer!.running).toBe(false);
    app().resetTimer();
    await flushStorage();
    const saved = memory.get('gm.current') as SavedGame;
    expect(saved.runtime!.timer).toMatchObject({ remainingMs: 60_000, running: false, deadline: null });
  });

  it('новый говорящий и отмена не получают таймер соседней фазы', async () => {
    const { app, flushStorage } = await setup();
    app().toggleTimer();
    now += 15_000;
    app().toggleTimer();
    expect(app().runtime!.timer!.remainingMs).toBe(45_000);
    app().dispatch({ type: 'Proceed' });
    expect(app().runtime!.timer!.remainingMs).toBe(60_000);
    app().toggleTimer();
    now += 10_000;
    app().toggleTimer();
    app().undo();
    expect(app().game!.state.phase).toMatchObject({ t: 'discussion', index: 0 });
    expect(app().runtime!.timer).toMatchObject({ remainingMs: 60_000, running: false });
    await flushStorage();
  });

  it('каждый из трёх раундов восстанавливает собственный черновик', async () => {
    const { app, flushStorage } = await setup(true);
    for (const kind of ['main', 'revote', 'allOut']) {
      expect(app().game!.state.phase).toMatchObject({ t: 'voting', kind });
      expect(app().runtime!.voting!.count).toBe(0);
      app().updateVotingDraft((draft) => ({ ...draft, quick: true, page: 1, counts: { p1: 1, p2: 1 }, yes: ['p3'], count: 1 }));
      app().closeGame();
      await flushStorage();
      const saved = memory.get('gm.current') as SavedGame;
      await app().resume();
      expect(app().runtime!.voting).toEqual(saved.runtime!.voting);
      app().setPaused(false);
      if (kind !== 'allOut') {
        expect(app().dispatch({ type: 'CastVotes', counts: { p1: 1, p2: 1 } })).toBe(true);
        if (kind === 'main') {
          expect(app().runtime!.voting).toBeNull();
          for (let i = 0; i < 2; i++) expect(app().dispatch({ type: 'Proceed' })).toBe(true);
        } else {
          expect(app().runtime!.voting!.yes).toEqual([]);
        }
      }
    }
    await flushStorage();
  });

  it('сбой завершения и закрытия не теряет финал при начале новой партии', async () => {
    const { app, flushStorage } = await setup();
    const oldId = app().gameId;
    vi.mocked(setMany).mockRejectedValueOnce(new Error('QuotaExceededError'));
    app().dispatch({ type: 'EndGame', result: 'draw' });
    await flushStorage();
    vi.mocked(setMany).mockRejectedValueOnce(new Error('QuotaExceededError'));
    app().closeGame();
    await flushStorage();
    expect(app().startGame(creation())).toBe(true);
    await flushStorage();
    expect((memory.get('gm.current') as SavedGame).id).not.toBe(oldId);
    expect((memory.get('gm.history') as SavedGame[])).toMatchObject([{ id: oldId, finishedAt: now }]);
    expect((await import('./lib/persistence')).useStorageHealth.getState().writeErrors).toEqual([]);
  });

  it('отмена финала убирает результат из истории и сохраняет продолжающуюся партию', async () => {
    const { app, flushStorage } = await setup();
    app().dispatch({ type: 'EndGame', result: 'draw' });
    await flushStorage();
    expect((memory.get('gm.history') as SavedGame[])).toHaveLength(1);
    app().undo();
    await flushStorage();
    expect(memory.get('gm.history')).toEqual([]);
    expect((memory.get('gm.current') as SavedGame).finishedAt).toBeUndefined();
    expect(app().game!.state.phase.t).toBe('discussion');
  });
});

describe('безопасное восстановление и замена', () => {
  it('сохраняет полный оригинал до частичного восстановления и не создаёт статистику для копии', async () => {
    const raw = { ...legacy, events: [...legacy.events, { type: 'UnknownFutureAction', secret: 'keep me' }, { type: 'Proceed' }] };
    memory.set('gm.current', structuredClone(raw));
    const { useApp } = await import('./store');
    const { flushStorage } = await import('./lib/persistence');
    await useApp.getState().init();
    expect(useApp.getState().currentRecovery).toMatchObject({ kind: 'partial', dropped: 2 });
    expect(memory.get('gm.current')).toEqual(raw);
    expect(await useApp.getState().resume()).toBe(true);
    await flushStorage();
    const backups = memory.get('gm.backups') as { original: unknown; reason: string }[];
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatchObject({ reason: 'recovery', original: raw });
    expect((memory.get('gm.current') as SavedGame).events).toHaveLength(3);
    expect(memory.get('gm.history')).toEqual([]);
    expect(useApp.getState().paused).toBe(true);
    expect(useApp.getState().currentRecovery).toBeNull();
  });

  it('при отказе резервной записи не изменяет исходный журнал и не открывает обрезанную партию', async () => {
    memory.set('gm.current', structuredClone(legacy));
    const { useApp } = await import('./store');
    const { retryStorage, flushStorage } = await import('./lib/persistence');
    await useApp.getState().init();
    vi.mocked(set).mockRejectedValueOnce(new Error('QuotaExceededError'));
    expect(await useApp.getState().resume()).toBe(false);
    expect(useApp.getState().game).toBeNull();
    expect(useApp.getState().dataBusy).toBe(false);
    expect(memory.get('gm.current')).toEqual(legacy);
    expect(memory.get('gm.backups')).toBeUndefined();
    await retryStorage();
    await flushStorage();
    expect(useApp.getState().game).toBeNull(); // A storage retry never approves a transition.
    expect(memory.get('gm.current')).toEqual(legacy);
    expect(await useApp.getState().resume()).toBe(true);
    await flushStorage();
    expect((memory.get('gm.current') as SavedGame).schemaVersion).toBe(1);
  });

  it('отмена замены оставляет партию, runtime, профили и настройки без изменений', async () => {
    const { app, flushStorage } = await setup();
    app().toggleTimer();
    await flushStorage();
    const oldGame = app().game;
    const oldRuntime = app().runtime;
    const oldId = app().gameId;
    const before = structuredClone(memory);
    const data = { setup: { count: 5, names: ['', '', '', '', ''], settings: CLASSIC_SETTINGS, preset: 'classic' as const, dealing: 'cards' as const }, profiles: [{ id: 'new-person', name: 'New', createdAt: now }] };
    expect(app().startGame(creation(), data)).toBe(false);
    expect(app().pendingStart).not.toBeNull();
    app().cancelStart();
    await flushStorage();
    expect(app().game).toBe(oldGame);
    expect(app().runtime).toBe(oldRuntime);
    expect(app().gameId).toBe(oldId);
    expect(memory).toEqual(before);
    expect(app().pendingStart).toBeNull();
    expect(app().startGame(creation(), data)).toBe(false);
    expect(await app().confirmStart()).toBe(true);
    await flushStorage();
    expect(app().gameId).not.toBe(oldId);
    expect(memory.get('gm.players')).toEqual(data.profiles);
    expect(memory.get('gm.lastSetup')).toEqual(data.setup);
    expect((memory.get('gm.backups') as { original: SavedGame }[])[0]!.original.id).toBe(oldId);
  });

  it('сбой копирования блокирует замену; повтор подтверждения создаёт новую партию только после успешной копии', async () => {
    const { app, flushStorage } = await setup();
    const oldId = app().gameId;
    const original = structuredClone(memory.get('gm.current'));
    app().startGame(creation());
    vi.mocked(set).mockRejectedValueOnce(new Error('Disk full'));
    expect(await app().confirmStart()).toBe(false);
    expect(app().gameId).toBe(oldId);
    expect(memory.get('gm.current')).toEqual(original);
    expect(app().pendingStart).not.toBeNull();
    expect(await app().confirmStart()).toBe(true);
    await flushStorage();
    expect(app().gameId).not.toBe(oldId);
    expect((memory.get('gm.backups') as { original: SavedGame }[])[0]!.original.id).toBe(oldId);
    expect((await import('./lib/persistence')).useStorageHealth.getState().writeErrors).toEqual([]);
  });

  it('повреждённое и будущее сохранения видны и не заменяются молча', async () => {
    for (const raw of [null, { broken: 'original' }, { ...legacy, schemaVersion: 99 }]) {
      vi.resetModules();
      memory.clear();
      memory.set('gm.current', structuredClone(raw));
      const { useApp } = await import('./store');
      await useApp.getState().init();
      expect(useApp.getState().currentRecovery).not.toBeNull();
      expect(useApp.getState().resumable).toBeNull();
      expect(useApp.getState().startGame(creation())).toBe(false);
      expect(memory.get('gm.current')).toEqual(raw);
      expect(await useApp.getState().confirmStart()).toBe(true);
      await (await import('./lib/persistence')).flushStorage();
      expect((memory.get('gm.backups') as { original: unknown }[])[0]!.original).toEqual(raw);
    }
  });

  it('восстанавливает копию на паузе, предварительно копируя текущую партию', async () => {
    const { app, flushStorage } = await setup();
    const currentId = app().gameId;
    const { backupGame, loadBackups } = await import('./lib/backups');
    expect(await backupGame(legacy, 'replacement')).toBe(true);
    const backup = (await loadBackups())[0]!;
    expect(await app().restoreBackup(backup)).toBe(true);
    await flushStorage();
    expect(app().gameId).toBe(legacy.id);
    expect(app().paused).toBe(true);
    expect(app().runtime!.timer!.remainingMs).toBe(45_000);
    expect((await loadBackups())).toHaveLength(2);
    expect((await loadBackups())[0]!.original).toMatchObject({ id: currentId });
    expect(memory.get('gm.history')).toEqual([]);
    expect(backup.original).toEqual(legacy);
  });
});
