import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get, set, setMany } from 'idb-keyval';
import type { GameEvent } from '@greenmafia/engine';
import legacy from './fixtures/legacy-game.json';
import { inspectGame } from './saveFormat';
import { runtimeFor } from './gameRuntime';
import type { SavedGame } from './storage';

const memory = vi.hoisted(() => new Map<unknown, unknown>());
vi.mock('idb-keyval', () => ({ get: vi.fn(), set: vi.fn(), setMany: vi.fn() }));
vi.mock('./sound', () => ({ setSoundContext: vi.fn(), setSoundEnabled: vi.fn(), setVibrationEnabled: vi.fn() }));
let now: number;

beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks();
  memory.clear(); now = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.stubGlobal('window', Object.assign(new EventTarget(), { scrollTo: vi.fn() }));
  vi.mocked(get).mockImplementation(async (key) => structuredClone(memory.get(key)));
  vi.mocked(set).mockImplementation(async (key, value) => { memory.set(key, structuredClone(value)); });
  vi.mocked(setMany).mockImplementation(async (entries) => { for (const [key, value] of entries) memory.set(key, structuredClone(value)); });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function setup() {
  const { useApp } = await import('../store');
  const ownership = await import('./tabOwnership');
  ownership.useTabOwnership.setState({ status: 'owner' });
  const inspected = inspectGame(legacy);
  if (inspected.kind !== 'ready') throw new Error('Bad fixture');
  useApp.setState({ ready: true, game: inspected.game, gameId: inspected.saved.id, createdAt: inspected.saved.createdAt,
    runtime: runtimeFor(inspected.game.state), screen: { name: 'game' }, lang: 'ru' });
  const crash = await import('./crashRecovery');
  const { flushStorage } = await import('./persistence');
  return { app: () => useApp.getState(), useApp, ownership, flushStorage, ...crash };
}

describe('сбой без потери партии и раскрытия секретов', () => {
  it('замораживает таймер и секреты, сохраняя полный проверенный журнал', async () => {
    const { app, reportCrash, useCrashState, flushStorage } = await setup();
    const events = structuredClone(app().game!.events);
    app().toggleTimer(); now += 12_000;
    app().setSecret('peek', true);
    reportCrash(new TypeError('private-player is mafia'), 'react');
    expect(app().crashed).toBe(true);
    expect(app().paused).toBe(true);
    expect(app().secrets).toEqual({ role: false, peek: false, answer: false });
    expect(app().runtime!.timer!.remainingMs).toBe(33_000);
    expect(app().game!.events).toEqual(events);
    expect(app().dispatch({ type: 'EndGame', result: 'draw' })).toBe(false);
    app().setSecret('answer', true); app().uncover();
    expect(app().privacyCovered).toBe(true);
    expect(app().secrets.answer).toBe(false);
    await flushStorage();
    expect((memory.get('gm.current') as SavedGame).runtime!.timer!.remainingMs).toBe(33_000);
    expect(useCrashState.getState().incident!.recoveryData).toMatchObject({ events, runtime: { paused: true } });
  });

  it('диагностика не содержит сообщение, stack, имена, id и роли из партии', async () => {
    const { reportCrash, useCrashState, flushStorage } = await setup();
    const error = new Error('secret-player-p0: комиссар, token=private-value');
    error.stack = 'secret-url?token=private-value';
    reportCrash(error, 'promise');
    const diagnostic = useCrashState.getState().incident!.diagnostic;
    expect(diagnostic).toMatchObject({ format: 'greenmafia-diagnostics', category: 'Error', source: 'promise', phase: 'discussion', screen: 'game' });
    const json = JSON.stringify(diagnostic);
    for (const forbidden of ['secret-player', 'p0', 'комиссар', 'private-value', 'Один', 'legacy-before-don', 'events', 'runtime', 'stack', 'message', 'seed', '"mafia"']) expect(json).not.toContain(forbidden);
    await flushStorage();
  });

  it('не заменяет первоначальную копию при повторном сообщении о том же сбое', async () => {
    const { app, reportCrash, useCrashState, flushStorage } = await setup();
    reportCrash(new TypeError('first'), 'react');
    const first = useCrashState.getState().incident;
    reportCrash(new Error('second'), 'event');
    expect(useCrashState.getState().incident).toBe(first);
    expect(app().recoveryEpoch).toBe(1);
    await flushStorage();
  });

  it('после восстановления не читает устаревшее автосохранение поверх живой памяти', async () => {
    const { app, reportCrash, recoverCrash, flushStorage } = await setup();
    const expected = structuredClone(app().game!.events);
    reportCrash(new Error('render'), 'react');
    await flushStorage();
    const reads = vi.mocked(get).mock.calls.length;
    now += 999_000;
    expect(recoverCrash('retry')).toBe(true);
    await app().init();
    expect(get).toHaveBeenCalledTimes(reads);
    expect(app().game!.events).toEqual(expected);
    expect(app().paused).toBe(true);
    expect(app().crashed).toBe(false);
  });

  it('с главной можно продолжить последнюю копию даже после отказа записи', async () => {
    const { app, reportCrash, recoverCrash, flushStorage } = await setup();
    const events = structuredClone(app().game!.events);
    vi.mocked(setMany).mockRejectedValueOnce(new Error('Disk full'));
    reportCrash(new Error('render'), 'react');
    await flushStorage();
    expect(recoverCrash('home')).toBe(true);
    expect(app().screen.name).toBe('home');
    expect(app().game).toBeNull();
    expect(app().resumable!.events).toEqual(events);
    expect(await app().resume()).toBe(true);
    await flushStorage();
    expect(app().game!.events).toEqual(events);
    expect(app().paused).toBe(true);
  });

  it('не обрезает повреждённый журнал автоматически; передаёт оригинал в безопасное восстановление', async () => {
    const { app, useApp, reportCrash, recoverCrash, useCrashState, flushStorage } = await setup();
    const damaged = [...app().game!.events, { type: 'FutureAction', original: 'keep' } as unknown as GameEvent];
    useApp.setState({ game: { ...app().game!, events: damaged } });
    const original = { schemaVersion: 1, id: app().gameId, createdAt: app().createdAt, events: damaged };
    memory.set('gm.current', structuredClone(original));
    reportCrash(new Error('render'), 'react');
    await flushStorage();
    expect(setMany).not.toHaveBeenCalled();
    expect(memory.get('gm.current')).toEqual(original);
    expect(useCrashState.getState().incident!.canRetry).toBe(false);
    expect(recoverCrash('retry')).toBe(false);
    expect(recoverCrash('home')).toBe(true);
    expect(app().currentRecovery).toMatchObject({ kind: 'partial', dropped: 1, original: { events: damaged } });
    expect(app().resumable!.events).toHaveLength(3);
  });

  it('при потере владения хранилищем сохраняет память, но не пишет устаревшие данные', async () => {
    const { ownership, reportCrash, useCrashState, flushStorage } = await setup();
    ownership.useTabOwnership.setState({ status: 'failed' });
    reportCrash(new Error('render'), 'event');
    await flushStorage();
    expect(setMany).not.toHaveBeenCalled();
    expect(useCrashState.getState().incident!.recoveryData).toMatchObject({ id: legacy.id });
  });

  it('незавершённое асинхронное создание игры не перезаписывает восстановленную сессию', async () => {
    const { app, reportCrash, recoverCrash, flushStorage } = await setup();
    const oldId = app().gameId;
    const creation = app().game!.events[0]!;
    if (creation.type !== 'CreateGame') throw new Error('No creation');
    app().startGame(creation);
    let releaseBackup: (() => void) | undefined;
    vi.mocked(set).mockImplementationOnce(() => new Promise<void>((resolve) => { releaseBackup = resolve; }));
    const pending = app().confirmStart();
    await vi.waitFor(() => expect(releaseBackup).toBeTypeOf('function'));
    reportCrash(new Error('render'), 'react');
    expect(recoverCrash('home')).toBe(true);
    expect(await app().resume()).toBe(true);
    releaseBackup!();
    expect(await pending).toBe(false);
    await flushStorage();
    expect(app().gameId).toBe(oldId);
    expect((memory.get('gm.current') as SavedGame).id).toBe(oldId);
  });

  it('перехватывает ошибки обработчиков и отклонённые promises, затем снимает обработчики', async () => {
    const { reportCrash, recoverCrash, installCrashHandlers, useCrashState, flushStorage } = await setup();
    const host = window;
    const clean = installCrashHandlers(host);
    const event = new Event('error', { cancelable: true });
    Object.defineProperty(event, 'error', { value: new Error('secret') });
    host.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(useCrashState.getState().incident!.diagnostic.source).toBe('event');
    recoverCrash('retry');
    const rejection = new Event('unhandledrejection', { cancelable: true });
    Object.defineProperty(rejection, 'reason', { value: 'secret-reason' });
    host.dispatchEvent(rejection);
    expect(useCrashState.getState().incident!.diagnostic.source).toBe('promise');
    recoverCrash('retry'); clean();
    host.dispatchEvent(event);
    expect(useCrashState.getState().incident).toBeNull();
    // Unknown error objects cannot inject a custom category into the report.
    reportCrash({ name: 'private-role', message: 'private-name' }, 'startup');
    expect(useCrashState.getState().incident!.diagnostic.category).toBe('Unknown');
    await flushStorage();
  });
});
