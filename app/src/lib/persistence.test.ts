import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('idb-keyval', () => ({ get: vi.fn(), set: vi.fn(), setMany: vi.fn(), del: vi.fn(), update: vi.fn() }));
vi.mock('./tabOwnership', () => ({ mayWrite: () => true }));

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

describe('надёжная запись', () => {
  it('постоянно показывает ошибку, а успешный повтор снимает её', async () => {
    const { writeStored, useStorageHealth, retryStorage } = await import('./persistence');
    const write = vi.fn().mockRejectedValueOnce(new Error('QuotaExceededError')).mockResolvedValue(undefined);
    expect(await writeStored('game', write)).toBe(false);
    expect(useStorageHealth.getState().writeErrors).toEqual(['game']);
    expect(useStorageHealth.getState().pending).toBe(0);
    await retryStorage();
    expect(write).toHaveBeenCalledTimes(2);
    expect(useStorageHealth.getState().writeErrors).toEqual([]);
    expect(useStorageHealth.getState().lastSavedAt).not.toBeNull();
  });

  it('выполняет все обычные операции по очереди, включая завершение и очистку', async () => {
    const { writeStored, flushStorage } = await import('./persistence');
    const log: string[] = [];
    void writeStored('game', async () => { log.push('finish+archive'); });
    void writeStored('game', async () => { log.push('close'); });
    await flushStorage();
    expect(log).toEqual(['finish+archive', 'close']);
  });

  it('повтор старой ошибки не перезаписывает новую партию', async () => {
    const { writeStored, retryStorage, flushStorage, useStorageHealth } = await import('./persistence');
    const old = vi.fn().mockRejectedValue(new Error('Offline storage'));
    await writeStored('game', old);
    const retry = retryStorage();
    const fresh = vi.fn().mockResolvedValue(undefined);
    void writeStored('game', fresh);
    await retry;
    await flushStorage();
    expect(old).toHaveBeenCalledTimes(1);
    expect(fresh).toHaveBeenCalledTimes(1);
    expect(useStorageHealth.getState().writeErrors).toEqual([]);
  });

  it('ошибка чтения блокирует запись вместо перезаписи пустой базы', async () => {
    const idb = await import('idb-keyval');
    vi.mocked(idb.get).mockRejectedValue(new Error('Cannot read'));
    const { readStored, writeStored, useStorageHealth } = await import('./persistence');
    expect(await readStored('gm.players', [])).toEqual([]);
    const write = vi.fn().mockResolvedValue(undefined);
    expect(await writeStored('players', write)).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(useStorageHealth.getState().readErrors).toEqual(['gm.players']);
  });

  it('не создаёт начальных игроков после ошибки чтения базы', async () => {
    const idb = await import('idb-keyval');
    vi.mocked(idb.get).mockRejectedValue(new Error('Database unavailable'));
    const { loadPlayers } = await import('./players');
    expect(await loadPlayers()).toEqual([]);
    expect(idb.set).not.toHaveBeenCalled();
  });

  it('повреждённые данные не считаются отсутствующими и блокируют начальную запись', async () => {
    const idb = await import('idb-keyval');
    vi.mocked(idb.get).mockResolvedValue(null);
    const { loadPlayers } = await import('./players');
    const { loadPrefs } = await import('./storage');
    const { useStorageHealth } = await import('./persistence');
    expect(await loadPlayers()).toEqual([]);
    expect(await loadPrefs()).toEqual({ sound: true });
    expect(idb.set).not.toHaveBeenCalled();
    expect(useStorageHealth.getState().readErrors).toEqual(['gm.players', 'gm.prefs']);
  });

  it('пишет партию с черновиком и архив атомарно, закрытие также сохраняет результат', async () => {
    const idb = await import('idb-keyval');
    vi.mocked(idb.get).mockResolvedValue([]);
    vi.mocked(idb.setMany).mockResolvedValue(undefined);
    const { saveGame } = await import('./storage');
    const saved = { schemaVersion: 1 as const, id: 'g', createdAt: 1, finishedAt: 2, events: [] };
    expect(await saveGame(saved)).toBe(true);
    expect(idb.setMany).toHaveBeenLastCalledWith([['gm.current', saved], ['gm.history', [saved]]]);
    await saveGame(saved, true);
    expect(idb.setMany).toHaveBeenLastCalledWith([['gm.current', undefined], ['gm.history', [saved]]]);
  });
});
