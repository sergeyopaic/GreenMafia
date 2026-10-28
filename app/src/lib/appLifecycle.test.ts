import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setMany } from 'idb-keyval';
import legacy from './fixtures/legacy-game.json';
import { inspectGame } from './saveFormat';
import { runtimeFor } from './gameRuntime';

const access = vi.hoisted(() => ({ owner: true }));
vi.mock('./tabOwnership', () => ({ mayWrite: () => access.owner }));
vi.mock('idb-keyval', () => ({ get: vi.fn(async () => undefined), setMany: vi.fn(async () => {}), set: vi.fn(async () => {}) }));
vi.mock('./sound', () => ({ setSoundContext: vi.fn(), setSoundEnabled: vi.fn(), setVibrationEnabled: vi.fn() }));

let now: number;
let hidden: boolean;
let focused: boolean;
let host: Window;
let page: Document;

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  access.owner = true; now = 1000; hidden = false; focused = true;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  host = Object.assign(new EventTarget(), { scrollTo: vi.fn() }) as unknown as Window;
  page = Object.assign(new EventTarget(), { documentElement: { dataset: {} }, hasFocus: () => focused }) as unknown as Document;
  Object.defineProperty(page, 'hidden', { get: () => hidden });
  vi.stubGlobal('window', host); vi.stubGlobal('document', page);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function setup() {
  const { useApp } = await import('../store');
  const r = inspectGame(legacy);
  if (r.kind !== 'ready') throw new Error('Fixture rejected');
  useApp.setState({ game: r.game, gameId: r.saved.id, createdAt: r.saved.createdAt, runtime: runtimeFor(r.game.state), screen: { name: 'game' } });
  const app = () => useApp.getState();
  const { installAppLifecycle } = await import('./appLifecycle');
  const { flushStorage } = await import('./persistence');
  const clean = installAppLifecycle(host, page);
  return { app, clean, flushStorage };
}

describe('секреты и прерывания приложения', () => {
  it('при blur сразу закрывает все секреты и сохраняет остаток; focus не раскрывает их снова', async () => {
    const { app, clean, flushStorage } = await setup();
    app().setSecret('role', true); app().setSecret('peek', true); app().setSecret('answer', true);
    app().toggleTimer(); now += 12_000;
    focused = false;
    host.dispatchEvent(new Event('blur'));
    expect(page.documentElement.dataset.privacy).toBe('covered');
    expect(app().secrets).toEqual({ role: false, peek: false, answer: false });
    expect(app().paused).toBe(true);
    expect(app().privacyEpoch).toBe(1);
    expect(app().runtime!.timer!.remainingMs).toBe(33_000);
    await flushStorage();
    expect(vi.mocked(setMany).mock.calls.at(-1)![0][0]![1]).toMatchObject({ runtime: { paused: true, timer: { remainingMs: 33_000 } } });
    focused = true; host.dispatchEvent(new Event('focus'));
    expect(page.documentElement.dataset.privacy).toBeUndefined();
    expect(app().paused).toBe(true);
    app().setSecret('answer', true);
    expect(app().secrets.answer).toBe(false);
    app().setPaused(false); app().setSecret('answer', true);
    expect(app().secrets.answer).toBe(true);
    await flushStorage(); clean();
  });

  it('видимая страница без фокуса остаётся закрытой до возвращения пользователя', async () => {
    const { app, clean, flushStorage } = await setup();
    hidden = true; focused = false;
    page.dispatchEvent(new Event('visibilitychange'));
    hidden = false;
    page.dispatchEvent(new Event('visibilitychange'));
    expect(app().privacyCovered).toBe(true);
    expect(page.documentElement.dataset.privacy).toBe('covered');
    focused = true; host.dispatchEvent(new Event('focus'));
    expect(app().privacyCovered).toBe(false);
    expect(app().paused).toBe(true);
    await flushStorage(); clean();
  });

  it('pagehide срабатывает даже до hidden; скрытая страница не может снять защиту', async () => {
    const { app, clean, flushStorage } = await setup();
    app().setSecret('peek', true);
    host.dispatchEvent(new Event('pagehide'));
    expect(app().secrets.peek).toBe(false);
    expect(app().privacyCovered).toBe(true);
    hidden = true;
    host.dispatchEvent(new Event('focus'));
    app().uncover(); app().setPaused(false); app().setSecret('role', true);
    expect(app().privacyCovered).toBe(true);
    expect(app().secrets.role).toBe(false);
    await flushStorage(); clean();
  });

  it('после потери права записи закрывает секреты без сохранения устаревшего состояния', async () => {
    const { app, clean, flushStorage } = await setup();
    app().setSecret('answer', true);
    access.owner = false;
    host.dispatchEvent(new Event('blur'));
    expect(app().secrets.answer).toBe(false);
    expect(app().paused).toBe(true);
    expect(app().dispatch({ type: 'EndGame', result: 'draw' })).toBe(false);
    await flushStorage();
    expect(setMany).not.toHaveBeenCalled(); clean();
  });

  it('смена игрового шага закрывает шпаргалку, ручная пауза закрывает ответы', async () => {
    const { app, clean, flushStorage } = await setup();
    app().setSecret('peek', true);
    expect(app().dispatch({ type: 'Proceed' })).toBe(true);
    expect(app().secrets.peek).toBe(false);
    app().setSecret('answer', true); app().setPaused(true);
    expect(app().secrets.answer).toBe(false);
    await flushStorage(); clean();
  });

  it('убирает обработчики при размонтировании', async () => {
    const { app, clean } = await setup();
    clean();
    host.dispatchEvent(new Event('blur'));
    expect(app().privacyCovered).toBe(false);
    expect(page.documentElement.dataset.privacy).toBeUndefined();
  });
});
