// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get, set, setMany } from 'idb-keyval';
import * as ownership from '../lib/tabOwnership';
import { useApp } from '../store';
import { dictFor } from '../i18n/dicts';
import { flushStorage, useStorageHealth } from '../lib/persistence';
import legacy from '../lib/fixtures/legacy-game.json';
import { App } from '../App';

vi.mock('idb-keyval', () => ({ get: vi.fn(), set: vi.fn(), setMany: vi.fn() }));
vi.mock('../lib/sound', () => ({ setSoundContext: vi.fn(), setSoundEnabled: vi.fn(), setVibrationEnabled: vi.fn(), play: vi.fn(), vibrate: vi.fn() }));

let root: Root;
let container: HTMLDivElement;
const memory = new Map<unknown, unknown>();
const ru = dictFor('ru');
const en = dictFor('en');
function button(label: string): HTMLButtonElement {
  const match = [...container.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim().startsWith(label));
  if (!match) throw new Error(`No button: ${label}`);
  return match;
}
async function click(label: string) { await act(async () => { button(label).click(); }); }
async function render() { await act(async () => { root.render(<App />); }); }
async function back() {
  await act(async () => { container.querySelector<HTMLButtonElement>(`button[aria-label="${ru.common.back}"]`)!.click(); });
}

beforeEach(() => {
  vi.resetAllMocks(); memory.clear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(ownership, 'claimTabOwnership').mockResolvedValue(true);
  ownership.useTabOwnership.setState({ status: 'owner' });
  useApp.setState(useApp.getInitialState(), true);
  useStorageHealth.setState({ pending: 0, writeErrors: [], readErrors: [], lastSavedAt: null });
  memory.set('gm.prefs', { sound: true, lang: 'ru' });
  vi.mocked(get).mockImplementation(async (key) => structuredClone(memory.get(key)));
  vi.mocked(set).mockImplementation(async (key, value) => { memory.set(key, structuredClone(value)); });
  vi.mocked(setMany).mockImplementation(async (entries) => { for (const [key, value] of entries) memory.set(key, structuredClone(value)); });
  delete document.documentElement.dataset.privacy;
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { await flushStorage(); root.unmount(); });
  container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('знакомство в настоящем приложении', () => {
  it('новый пользователь меняет язык до начала, пропускает знакомство и повторно открывает его с главной', async () => {
    await render();
    expect(container.querySelector('h1')!.textContent).toBe(ru.welcome.title);
    expect(container.querySelectorAll('.welcome__steps > li')).toHaveLength(3);
    expect(container.textContent).toContain(ru.welcome.lead);
    expect(document.documentElement.dataset.theme).toBe('night');
    await click('EN');
    expect(container.querySelector('h1')!.textContent).toBe(en.welcome.title);
    expect(document.documentElement.lang).toBe('en');
    await click(en.welcome.home);
    expect(useApp.getState().screen.name).toBe('home');
    await click(en.home.howToPlay);
    expect(container.querySelector('h1')!.textContent).toBe(en.welcome.title);
    expect(useApp.getState().introSeen).toBe(true);
    expect(memory.has('gm.players')).toBe(false); expect(memory.has('gm.current')).toBe(false);
  });

  it('из знакомства можно сразу настроить партию без навязанных имён', async () => {
    await render(); await click(ru.welcome.start);
    expect(useApp.getState().screen.name).toBe('setup');
    expect(container.querySelector('.wizard-steps')).not.toBeNull();
    expect(memory.has('gm.players')).toBe(false); expect(memory.has('gm.current')).toBe(false);
  });

  it('пустая база объясняет локальные профили и не заполняется после переходов', async () => {
    await render(); await click(ru.welcome.home); await click(ru.home.players);
    expect(container.textContent).toContain(ru.players.empty);
    expect(container.querySelectorAll('.player-row')).toHaveLength(0);
    expect(container.querySelector(`input[aria-label="${ru.players.newAria}"]`)).not.toBeNull();
    await back(); await click(ru.home.howToPlay); await click(ru.welcome.home); await click(ru.home.players);
    expect(container.querySelectorAll('.player-row')).toHaveLength(0);
    expect(memory.has('gm.players')).toBe(false);
  });

  it('у старого пользователя сохраняются продолжение партии и профили даже при повторном знакомстве', async () => {
    const profiles = [{ id: 'pl_existing', name: 'Игрок клуба', createdAt: 1 }];
    memory.set('gm.current', structuredClone(legacy)); memory.set('gm.players', structuredClone(profiles));
    await render();
    expect(useApp.getState().screen.name).toBe('home'); expect(button(ru.home.continue)).toBeDefined();
    await click(ru.home.howToPlay); await click(ru.welcome.home); await click(ru.home.players);
    expect(container.textContent).toContain('Игрок клуба');
    expect(memory.get('gm.players')).toEqual(profiles); expect(memory.get('gm.current')).toEqual(legacy);
    await back(); await click(ru.home.continue);
    expect(useApp.getState().gameId).toBe(legacy.id); expect(useApp.getState().paused).toBe(true);
    expect(button(ru.bar.resume).disabled).toBe(false);
  });
});
