// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get, set, setMany } from 'idb-keyval';
import * as ownership from '../lib/tabOwnership';
import { useApp } from '../store';
import { dictFor } from '../i18n/dicts';
import { inspectGame } from '../lib/saveFormat';
import { runtimeFor } from '../lib/gameRuntime';
import { flushStorage } from '../lib/persistence';
import { installCrashHandlers, reportCrash, useCrashState } from '../lib/crashRecovery';
import { exportJson } from '../lib/exportData';
import legacy from '../lib/fixtures/legacy-game.json';
import { CrashGuard } from './CrashGuard';
import { App } from '../App';

vi.mock('idb-keyval', () => ({ get: vi.fn(), set: vi.fn(), setMany: vi.fn() }));
vi.mock('../lib/sound', () => ({ setSoundContext: vi.fn(), setSoundEnabled: vi.fn(), setVibrationEnabled: vi.fn(), play: vi.fn(), vibrate: vi.fn() }));
vi.mock('../lib/exportData', () => ({ exportJson: vi.fn(), exportDeviceData: vi.fn(async () => {}) }));

let root: Root;
let container: HTMLDivElement;
let cleanup: () => void;
let broken: boolean;
const memory = new Map<unknown, unknown>();
const t = dictFor('ru');

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(label));
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
async function click(label: string) { await act(async () => { button(label).click(); }); }

beforeEach(() => {
  vi.resetAllMocks();
  memory.clear(); broken = true;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  vi.spyOn(ownership, 'claimTabOwnership').mockResolvedValue(true);
  ownership.useTabOwnership.setState({ status: 'owner' });
  useApp.setState(useApp.getInitialState(), true);
  useCrashState.setState({ incident: null, generation: 0 });
  delete document.documentElement.dataset.crash;
  delete document.documentElement.dataset.privacy;
  vi.mocked(get).mockImplementation(async (key) => structuredClone(memory.get(key)));
  vi.mocked(set).mockImplementation(async (key, value) => { memory.set(key, structuredClone(value)); });
  vi.mocked(setMany).mockImplementation(async (entries) => { for (const [key, value] of entries) memory.set(key, structuredClone(value)); });
  const r = inspectGame(legacy);
  if (r.kind !== 'ready') throw new Error('Bad fixture');
  useApp.setState({ ready: true, game: r.game, gameId: r.saved.id, createdAt: r.saved.createdAt, runtime: runtimeFor(r.game.state), screen: { name: 'game' }, lang: 'ru' });
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container, { onCaughtError: (error) => reportCrash(error, 'react') });
  cleanup = installCrashHandlers();
});

afterEach(async () => {
  await act(async () => { await flushStorage(); root.unmount(); });
  cleanup(); container.remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('аварийный экран в React DOM', () => {
  it('ловит ошибку отрисовки, скрывает подробности и восстанавливает дерево без потери партии', async () => {
    function Screen() {
      if (broken) throw new TypeError('SECRET_PLAYER is mafia');
      return <p>Рабочий экран</p>;
    }
    await act(async () => { root.render(<CrashGuard><Screen /></CrashGuard>); });
    expect(container.textContent).toContain(t.crash.title);
    expect(container.textContent).not.toContain('SECRET_PLAYER');
    expect(container.textContent).not.toContain('TypeError');
    expect(useApp.getState().paused).toBe(true);
    broken = false;
    await click(t.crash.retry);
    expect(container.textContent).toContain('Рабочий экран');
    expect(useApp.getState().gameId).toBe(legacy.id);
    expect(useApp.getState().game!.events).toHaveLength(3);
  });

  it('ошибка обработчика переключает весь интерфейс на безопасный экран', async () => {
    function Screen() { return <button onClick={() => { throw new Error('SECRET_HANDLER'); }}>Проверить обработчик</button>; }
    await act(async () => { root.render(<CrashGuard><Screen /></CrashGuard>); });
    await click('Проверить обработчик');
    expect(container.textContent).toContain(t.crash.title);
    expect(container.textContent).not.toContain('SECRET_HANDLER');
    expect(useCrashState.getState().incident!.diagnostic.source).toBe('event');
  });

  it('выгружает обезличенную диагностику отдельно от полного файла партии; отказ выгрузки не ломает экран', async () => {
    await act(async () => { reportCrash(new Error('SECRET_EXPORT'), 'event'); root.render(<CrashGuard><App /></CrashGuard>); });
    await click(t.crash.exportDiagnostics);
    const diagnostic = vi.mocked(exportJson).mock.calls[0]![1];
    expect(diagnostic).toMatchObject({ format: 'greenmafia-diagnostics' });
    expect(JSON.stringify(diagnostic)).not.toContain('events');
    expect(JSON.stringify(diagnostic)).not.toContain('SECRET_EXPORT');
    await click(t.crash.exportGame);
    expect(vi.mocked(exportJson).mock.calls[1]![1]).toMatchObject({ id: legacy.id, events: expect.any(Array) });
    expect(container.textContent).toContain(t.recovery.exportPrivacy);
    vi.mocked(exportJson).mockImplementationOnce(() => { throw new Error('Download unavailable'); });
    await click(t.crash.exportDiagnostics);
    expect(container.textContent).toContain(t.recovery.exportFailed);
    expect(container.textContent).toContain(t.crash.title);
  });

  it('из реального приложения возвращается на главную, открывает правила и продолжает ту же партию на паузе', async () => {
    await act(async () => { root.render(<CrashGuard><App /></CrashGuard>); });
    await act(async () => { reportCrash(new Error('screen'), 'event'); });
    await click(t.crash.home);
    expect(useApp.getState().screen.name).toBe('home');
    expect(button(t.home.continue)).toBeDefined();
    await click(t.home.rules);
    expect(useApp.getState().screen.name).toBe('rules');
    await act(async () => { container.querySelector<HTMLButtonElement>(`button[aria-label="${t.common.back}"]`)!.click(); });
    expect(useApp.getState().screen.name).toBe('home');
    await click(t.home.continue);
    expect(useApp.getState().screen.name).toBe('game');
    expect(useApp.getState().gameId).toBe(legacy.id);
    expect(useApp.getState().paused).toBe(true);
    await click(t.bar.resume);
    expect(useApp.getState().paused).toBe(false);
    expect(container.querySelector('.timer__digits')!.textContent).toBe('0:45');
  });
});
