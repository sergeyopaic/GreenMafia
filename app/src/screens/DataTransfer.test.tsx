// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get, set, setMany } from 'idb-keyval';
import * as ownership from '../lib/tabOwnership';
import { commitImport, commitClear } from '../lib/importData';
import { useApp } from '../store';
import { dictFor } from '../i18n/dicts';
import { flushStorage, retryStorage, useStorageHealth } from '../lib/persistence';
import { MAX_IMPORT_BYTES, ImportError } from '../lib/deviceFormat';
import legacy from '../lib/fixtures/legacy-game.json';
import { App } from '../App';

vi.mock('idb-keyval', () => ({ get: vi.fn(), set: vi.fn(), setMany: vi.fn() }));
vi.mock('../lib/sound', () => ({ setSoundContext: vi.fn(), setSoundEnabled: vi.fn(), setVibrationEnabled: vi.fn(), play: vi.fn(), vibrate: vi.fn() }));
vi.mock('../lib/importData', () => ({ commitImport: vi.fn(async () => {}), commitClear: vi.fn(async () => {}), loadDeviceCopies: vi.fn(async () => []), deviceEnvelope: (data: unknown) => ({ format: 'greenmafia-device-backup', version: 1, exportedAt: 1, data }) }));
let root: Root; let container: HTMLDivElement;
const t = dictFor('ru');
function button(label: string) {
  const found = [...container.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`); return found;
}
async function click(label: string) { await act(async () => { button(label).click(); }); }
async function render() { await act(async () => { root.render(<App />); }); await click(t.preferences.title); }
async function file(raw: unknown, large = false) {
  const selected = new File([typeof raw === 'string' ? raw : JSON.stringify(raw)], 'backup.json', { type: 'application/json' });
  if (large) Object.defineProperty(selected, 'size', { value: MAX_IMPORT_BYTES + 1 });
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { value: [selected], configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(document, 'hasFocus').mockReturnValue(true); vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(ownership, 'claimTabOwnership').mockResolvedValue(true); ownership.useTabOwnership.setState({ status: 'owner' });
  useApp.setState(useApp.getInitialState(), true); useStorageHealth.setState({ pending: 0, writeErrors: [], readErrors: [], lastSavedAt: null });
  vi.mocked(get).mockImplementation(async (key) => key === 'gm.prefs' ? { sound: true, introSeen: true, lang: 'ru' } : undefined);
  vi.mocked(set).mockResolvedValue(); vi.mocked(setMany).mockResolvedValue(); vi.mocked(commitImport).mockResolvedValue();
  delete document.documentElement.dataset.privacy;
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => { await flushStorage(); root.unmount(); }); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('предпросмотр и подтверждение импорта', () => {
  it('показывает только количества, а отмена не пишет данные', async () => {
    await render();
    await file({ format: 'greenmafia-device-backup', version: 1, exportedAt: 1, data: { 'gm.current': legacy, 'gm.players': [{ id: 'pl_private', name: 'СЕКРЕТНОЕ ИМЯ', createdAt: 1 }] } });
    expect(container.textContent).toContain(t.transfer.summary(0, 1, 0, 0)); expect(container.textContent).toContain(t.transfer.replaceDevice);
    expect(container.textContent).not.toContain('СЕКРЕТНОЕ ИМЯ'); expect(container.textContent).not.toContain('legacy-before-don');
    await click(t.common.cancel); expect(container.querySelector('.import-preview')).toBeNull();
    expect(commitImport).not.toHaveBeenCalled(); expect(set).not.toHaveBeenCalled();
  });

  it('после подтверждения блокирует старый экран до перезапуска и не импортирует дважды', async () => {
    await render(); await file(legacy);
    expect(container.textContent).toContain(t.transfer.replaceGame);
    let done!: () => void; vi.mocked(commitImport).mockImplementationOnce(() => new Promise<void>((resolve) => { done = resolve; }));
    await click(t.transfer.confirm); expect(container.textContent).toContain(t.transfer.importing);
    expect(container.querySelector('.app-content')!.hasAttribute('inert')).toBe(true);
    await click(t.transfer.confirm); expect(commitImport).toHaveBeenCalledOnce();
    await act(async () => { done(); });
    expect(container.textContent).toContain(t.transfer.complete); expect(button(t.storage.reload)).toBeDefined();
    expect(useApp.getState().importComplete).toBe(true);
  });

  it.each(['invalid', 'future', 'large'] as const)('ошибка %s не меняет базу и не оставляет подтверждение старого файла', async (kind) => {
    await render(); await file(legacy);
    await file(kind === 'invalid' ? 'broken json' : kind === 'future' ? { ...legacy, schemaVersion: 99 } : legacy, kind === 'large');
    expect(container.textContent).toContain(t.transfer.errors[kind]); expect(container.querySelector('.import-preview')).toBeNull();
    expect(commitImport).not.toHaveBeenCalled(); expect(set).not.toHaveBeenCalled();
  });

  it('сбой записи требует повторного подтверждения и не повторяется общей кнопкой сохранения', async () => {
    await render(); await file(legacy); vi.mocked(commitImport).mockRejectedValueOnce(new ImportError('storage'));
    await click(t.transfer.confirm); expect(container.textContent).toContain(t.transfer.errors.storage);
    expect(useApp.getState().importing).toBe(false); await retryStorage(); expect(commitImport).toHaveBeenCalledOnce();
    await click(t.transfer.confirm); expect(commitImport).toHaveBeenCalledTimes(2);
  });

  it('потеря фокуса скрывает экран и не позволяет подтвердить импорт до возврата', async () => {
    await render(); await file(legacy);
    await act(async () => { window.dispatchEvent(new Event('blur')); });
    await click(t.transfer.confirm); expect(commitImport).not.toHaveBeenCalled();
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await click(t.transfer.confirm); expect(commitImport).toHaveBeenCalledOnce();
  });

  it('отмена очистки истории не выполняет запись', async () => {
    await render(); await click(t.cleanup.history); expect(container.textContent).toContain(t.cleanup.historyHint);
    await click(t.common.cancel); expect(commitClear).not.toHaveBeenCalled(); expect(set).not.toHaveBeenCalled();
  });

  it('полная очистка требует точного слова и показывает отдельный результат', async () => {
    await render(); await click(t.cleanup.all);
    expect(container.textContent).toContain(t.cleanup.allHint); expect(container.textContent).toContain(t.cleanup.exportHint);
    expect(button(t.cleanup.confirm).disabled).toBe(true); await click(t.cleanup.confirm); expect(commitClear).not.toHaveBeenCalled();
    const input = container.querySelector<HTMLInputElement>('input[autocomplete="off"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, t.cleanup.word);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(button(t.cleanup.confirm).disabled).toBe(false); await click(t.cleanup.confirm);
    expect(commitClear).toHaveBeenCalledWith('all', undefined, expect.any(Function));
    expect(container.textContent).toContain(t.cleanup.complete); expect(container.textContent).toContain(t.cleanup.allDone);
  });

  it('сбой очистки сохраняет подтверждение и не повторяется автоматически', async () => {
    await render(); await click(t.cleanup.history); vi.mocked(commitClear).mockRejectedValueOnce(new Error('Denied'));
    await click(t.cleanup.confirm); expect(container.textContent).toContain(t.cleanup.failed);
    await retryStorage(); expect(commitClear).toHaveBeenCalledOnce();
    await click(t.cleanup.confirm); expect(commitClear).toHaveBeenCalledTimes(2); expect(container.textContent).toContain(t.cleanup.historyDone);
  });
});
