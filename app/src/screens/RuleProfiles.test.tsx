// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get, set, setMany } from 'idb-keyval';
import * as ownership from '../lib/tabOwnership';
import { useApp } from '../store';
import { dictFor } from '../i18n/dicts';
import { flushStorage, useStorageHealth } from '../lib/persistence';
import { App } from '../App';

vi.mock('idb-keyval', () => ({ get: vi.fn(), set: vi.fn(), setMany: vi.fn() }));
vi.mock('../lib/sound', () => ({ setSoundContext: vi.fn(), setSoundEnabled: vi.fn(), setVibrationEnabled: vi.fn(), play: vi.fn(), vibrate: vi.fn() }));
let root: Root;
let container: HTMLDivElement;
const memory = new Map<unknown, unknown>();
const ru = dictFor('ru');
const pr = ru.setup.profiles;

function buttons(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>('button')];
}
function button(label: string): HTMLButtonElement {
  const found = buttons().find((b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
const profileRow = (name: string) => buttons().find((b) => b.classList.contains('rule-profile__pick') && b.querySelector('.list__title')?.textContent === name);
async function click(target: string | HTMLElement) {
  await act(async () => { (typeof target === 'string' ? button(target) : target).click(); });
}
async function type(value: string) {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${pr.nameLabel}"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
/** Flips the first on/off rule, so the rules no longer match any built-in set. */
async function changeARule() {
  await click(document.querySelector<HTMLButtonElement>('button[role="switch"]')!);
}
async function stored() {
  await act(async () => { await flushStorage(); });
  return memory.get('gm.ruleProfiles') as { name: string; settings: unknown }[] | undefined;
}
async function openRulesStep() {
  await act(async () => { root.render(<App />); });
  await click(ru.home.newGame);
  await click(ru.common.next);
  await click(ru.common.next);
}

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
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { await flushStorage(); root.unmount(); }); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('профили правил при настройке партии', () => {
  it('сохраняет свои правила, выбирает их одним нажатием и обновляет после правок', async () => {
    await openRulesStep();
    expect(container.textContent).toContain(pr.builtIn); // Classic is selected: nothing to save yet
    expect(container.textContent).not.toContain(pr.empty); // one hint at a time
    expect(() => button(pr.save)).toThrow();

    await changeARule();
    expect(button(ru.setup.presets.custom).getAttribute('aria-pressed')).toBe('true');
    await click(pr.save);
    await type('Наш клуб');
    await click(ru.common.save);
    expect(container.textContent).toContain(pr.saved('Наш клуб'));
    expect((await stored())!.map((p) => p.name)).toEqual(['Наш клуб']);
    expect(profileRow('Наш клуб')!.getAttribute('aria-pressed')).toBe('true');
    expect(button(ru.setup.presets.custom).getAttribute('aria-pressed')).toBe('false');
    const ours = (await stored())![0]!.settings;

    await click(ru.setup.presets.classic);
    expect(profileRow('Наш клуб')!.getAttribute('aria-pressed')).toBe('false');
    expect(() => button(pr.update('Наш клуб'))).toThrow(); // switching to Classic is not an edit of the profile
    await click(profileRow('Наш клуб')!);
    expect(profileRow('Наш клуб')!.getAttribute('aria-pressed')).toBe('true');

    // Edit the loaded profile with another rule (flipping the first one back would give plain Classic).
    await click(document.querySelectorAll<HTMLButtonElement>('button[role="switch"]')[1]!);
    expect(container.textContent).toContain(pr.changed);
    await click(pr.update('Наш клуб'));
    const updated = (await stored())![0]!.settings;
    expect(updated).not.toEqual(ours);
    expect(profileRow('Наш клуб')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('не даёт занять название стандартного набора или повторить своё; переименовывает и удаляет', async () => {
    await openRulesStep();
    await changeARule();
    await click(pr.save);
    await type('Classic');
    await click(ru.common.save);
    expect(container.textContent).toContain(pr.errors.reserved);
    await type('Турнир');
    await click(ru.common.save);
    expect((await stored())!.map((p) => p.name)).toEqual(['Турнир']);

    await click(ru.setup.presets.classic);
    await changeARule();
    await changeARule(); // back to Classic
    await click(document.querySelectorAll<HTMLButtonElement>('button[role="switch"]')[1]!);
    await click(pr.save);
    await type('турнир');
    await click(ru.common.save);
    expect(container.textContent).toContain(pr.errors.exists);
    await click(ru.common.cancel);

    await click(pr.renameAria('Турнир'));
    await type('Финал');
    await click(ru.common.save);
    expect((await stored())!.map((p) => p.name)).toEqual(['Финал']);

    await click(pr.deleteAria('Финал'));
    expect(container.textContent).toContain(pr.deleteTitle('Финал'));
    await click(ru.common.delete);
    expect(await stored()).toEqual([]);
    expect(container.textContent).toContain(pr.empty);
  });

  it('при повторном открытии показывает сохранённые профили и узнаёт выбранный', async () => {
    const { createProfile } = await import('../lib/ruleProfiles');
    const { PRESETS } = await import('@greenmafia/engine');
    memory.set('gm.ruleProfiles', createProfile([], 'Быстрая', { ...PRESETS.classic, timers: { ...PRESETS.classic.timers, speech: 30 } }, 1));
    await openRulesStep();
    expect(profileRow('Быстрая')!.getAttribute('aria-pressed')).toBe('false');
    await click(profileRow('Быстрая')!);
    expect(profileRow('Быстрая')!.getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).not.toContain(pr.save);
  });
});
