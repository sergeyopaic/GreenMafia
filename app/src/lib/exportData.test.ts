import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMany } from 'idb-keyval';
import { exportDeviceData } from './exportData';
import legacy from './fixtures/legacy-game.json';

vi.mock('idb-keyval', () => ({ getMany: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function downloads() {
  const blobs: Blob[] = [];
  const link = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
  vi.stubGlobal('URL', { createObjectURL: (blob: Blob) => { blobs.push(blob); return 'blob:test-export'; }, revokeObjectURL: vi.fn() });
  vi.stubGlobal('document', { createElement: () => link, body: { append: vi.fn() } });
  vi.stubGlobal('window', { setTimeout: vi.fn() });
  return { blobs, link };
}

describe('выгрузка исходных данных', () => {
  it('сохраняет старый формат, неизвестные действия и нечитаемые значения без нормализации', async () => {
    const raw = { ...legacy, schemaVersion: 99, events: [...legacy.events, { type: 'FutureAction', original: 'keep' }] };
    const values: Record<string, unknown> = { 'gm.current': raw, 'gm.history': null, 'gm.players': [{ old: 'format' }], 'gm.backups': [{ original: raw }] };
    vi.mocked(getMany).mockImplementation(async (keys) => keys.map((key) => structuredClone(values[String(key)])));
    const { blobs, link } = downloads();
    await exportDeviceData();
    const exported = JSON.parse(await blobs[0]!.text());
    expect(exported).toMatchObject({ format: 'greenmafia-device-backup', version: 1, data: values });
    expect(exported.data['gm.current'].events).toHaveLength(4);
    expect(link.download).toMatch(/^greenmafia-device-\d+\.json$/);
    expect(link.click).toHaveBeenCalledOnce();
  });

  it('при отказе чтения не выдаёт неполный файл за успешную выгрузку', async () => {
    vi.mocked(getMany).mockRejectedValue(new Error('Storage unavailable'));
    const { blobs, link } = downloads();
    await expect(exportDeviceData()).rejects.toThrow();
    expect(blobs).toHaveLength(0);
    expect(link.click).not.toHaveBeenCalled();
  });
});
