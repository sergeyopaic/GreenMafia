// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get, set, setMany } from 'idb-keyval';
import * as ownership from '../lib/tabOwnership';
import { useApp } from '../store';
import { dictFor } from '../i18n/dicts';
import { flushStorage, useStorageHealth } from '../lib/persistence';
import { exportDeviceData } from '../lib/exportData';
import { APP_VERSION, SUPPORT_URL } from '../lib/appInfo';
import { App } from '../App';

vi.mock('idb-keyval', () => ({ get: vi.fn(), set: vi.fn(), setMany: vi.fn() }));
vi.mock('../lib/sound', () => ({ setSoundContext: vi.fn(), setSoundEnabled: vi.fn(), setVibrationEnabled: vi.fn(), play: vi.fn(), vibrate: vi.fn() }));
vi.mock('../lib/exportData', () => ({ exportDeviceData: vi.fn(async () => {}), exportJson: vi.fn() }));
let root: Root;
let container: HTMLDivElement;
const memory = new Map<unknown, unknown>();
const ru = dictFor('ru'); const en = dictFor('en');
function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
async function click(label: string) { await act(async () => { button(label).click(); }); }
async function back() { await act(async () => { container.querySelector<HTMLButtonElement>('button.icon-btn')!.click(); }); }
async function render() { await act(async () => { root.render(<App />); }); await click(ru.preferences.title); }
beforeEach(() => {
  vi.resetAllMocks(); memory.clear(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(document, 'hasFocus').mockReturnValue(true); vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(ownership, 'claimTabOwnership').mockResolvedValue(true); ownership.useTabOwnership.setState({ status: 'owner' });
  useApp.setState(useApp.getInitialState(), true);
  useStorageHealth.setState({ pending: 0, writeErrors: [], readErrors: [], lastSavedAt: null });
  memory.set('gm.prefs', { sound: true, introSeen: true, lang: 'ru' });
  vi.mocked(get).mockImplementation(async (key) => structuredClone(memory.get(key)));
  vi.mocked(set).mockImplementation(async (key, value) => { memory.set(key, structuredClone(value)); });
  vi.mocked(setMany).mockImplementation(async (entries) => { for (const [key, value] of entries) memory.set(key, structuredClone(value)); });
  delete document.documentElement.dataset.privacy;
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { await flushStorage(); root.unmount(); }); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('единый экран настроек', () => {
  it('доступен с главной, отдельно меняет звук/вибрацию и переводится сразу', async () => {
    await render();
    const controls = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(controls).toHaveLength(2); expect(controls[0]!.labels![0]!.textContent).toBe(ru.preferences.sound);
    await act(async () => { controls[0]!.click(); });
    expect(useApp.getState()).toMatchObject({ sound: false, vibration: true });
    await act(async () => { controls[1]!.click(); });
    expect(useApp.getState()).toMatchObject({ sound: false, vibration: false });
    await click('EN'); expect(container.querySelector('h1')!.textContent).toBe(en.preferences.title);
    expect(container.textContent).toContain(en.preferences.version(APP_VERSION));
    await act(async () => { await flushStorage(); });
    expect(memory.get('gm.prefs')).toEqual({ sound: false, vibration: false, lang: 'en', introSeen: true, keepAwake: 'game' });
  });

  it('из резервных копий возвращается в тот раздел, из которого они открыты', async () => {
    await render(); await click(ru.recovery.backupsTitle); expect(useApp.getState().screen).toEqual({ name: 'backups', back: 'settings' });
    await back(); expect(useApp.getState().screen.name).toBe('settings');
    await back(); await click(ru.home.history); await click(ru.recovery.backupsTitle); await back();
    expect(useApp.getState().screen.name).toBe('history');
  });

  it('поясняет хранение и показывает полные лицензии офлайн без сетевых запросов', async () => {
    const network = vi.fn(() => { throw new Error('Offline'); }); vi.stubGlobal('fetch', network);
    await render(); await click(ru.preferences.privacy);
    expect(container.textContent).toContain(ru.preferences.network.text); expect(container.textContent).toContain(ru.preferences.exports.text);
    await back(); await click(ru.preferences.licenses);
    await act(async () => { await vi.dynamicImportSettled(); });
    expect(container.querySelector('pre')!.textContent).toContain('Required Notice: Copyright 2026 Sergey Ivanov');
    expect(container.textContent).toContain('Copyright 2016, Jake Archibald');
    expect(container.textContent).toContain('TERMS AND CONDITIONS FOR USE');
    expect(container.textContent).toContain('SIL OPEN FONT LICENSE Version 1.1');
    expect(container.textContent).toContain('scheduler'); expect(container.textContent).toContain('workbox-precaching');
    expect(network).not.toHaveBeenCalled(); expect(set).not.toHaveBeenCalled();
  });

  it('выгрузка защищена от двойного нажатия, а отказ оставляет экран доступным', async () => {
    await render();
    let reject!: (error: Error) => void;
    vi.mocked(exportDeviceData).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    await click(ru.recovery.exportDevice);
    expect(button(ru.preferences.exporting).disabled).toBe(true);
    await click(ru.preferences.exporting); expect(exportDeviceData).toHaveBeenCalledOnce();
    await act(async () => { reject(new Error('Download failed')); });
    expect(container.textContent).toContain(ru.recovery.exportFailed); expect(button(ru.recovery.exportDevice).disabled).toBe(false);
    expect(container.textContent).toContain(ru.recovery.exportPrivacy);
  });

  it('ссылка поддержки не содержит имён, партии или автоматической отправки отчёта', async () => {
    await render(); const link = container.querySelector<HTMLAnchorElement>('a')!;
    expect(link.href).toBe(SUPPORT_URL); expect(link.search).toBe(''); expect(link.rel).toContain('noopener');
    expect(container.textContent).toContain(ru.preferences.supportHint);
    expect(memory.has('gm.current')).toBe(false); expect(memory.has('gm.players')).toBe(false);
  });

  it('режим «Не гасить экран» сохраняется и сразу берёт или отпускает блокировку экрана', async () => {
    const release = vi.fn(async () => {});
    const request = vi.fn(async () => ({ release }));
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    try {
      await render();
      expect(button(ru.preferences.keepAwakeModes.game).getAttribute('aria-pressed')).toBe('true');
      expect(container.textContent).toContain(ru.preferences.keepAwakeHint);
      expect(request).not.toHaveBeenCalled(); // «Во время игры», а это экран настроек
      await click(ru.preferences.keepAwakeModes.always);
      expect(request).toHaveBeenCalledWith('screen');
      expect(button(ru.preferences.keepAwakeModes.always).getAttribute('aria-pressed')).toBe('true');
      await act(async () => { await flushStorage(); });
      expect(memory.get('gm.prefs')).toMatchObject({ keepAwake: 'always' });
      await click(ru.preferences.keepAwakeModes.never);
      expect(release).toHaveBeenCalled();
      await act(async () => { await flushStorage(); });
      expect(memory.get('gm.prefs')).toMatchObject({ keepAwake: 'never' });
    } finally {
      delete (navigator as { wakeLock?: unknown }).wakeLock;
    }
  });

  it('без поддержки в браузере честно советует настроить автоблокировку', async () => {
    await render();
    expect(container.textContent).toContain(ru.preferences.keepAwakeUnsupported);
  });
});
