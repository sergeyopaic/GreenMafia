import { getMany, createStore } from 'idb-keyval';
import { withExclusiveStorage, readStored } from './persistence';
import { DEVICE_KEYS, DEVICE_COPIES_KEY, decodeDeviceCopies, inspectImport, ImportError, type ImportPlan, type DeviceData, type DeviceCopy } from './deviceFormat';
import { mayWrite } from './tabOwnership';
import { decodeHistory } from './saveFormat';

export const loadDeviceCopies = () => readStored<DeviceCopy[]>(DEVICE_COPIES_KEY, [], decodeDeviceCopies);
export const deviceEnvelope = (data: DeviceData) => ({ format: 'greenmafia-device-backup', version: 1, exportedAt: Date.now(), data });
let transactionStore: ReturnType<typeof createStore> | undefined;

function replaceAtomically(entries: [IDBValidKey, unknown][], valid: () => boolean, remove: IDBValidKey[] = []): Promise<void> {
  transactionStore ??= createStore('keyval-store', 'keyval');
  return transactionStore('readwrite', (store) => new Promise<void>((resolve, reject) => {
    const transaction = store.transaction;
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new ImportError('storage'));
    try {
      if (!valid() || !mayWrite()) throw new ImportError('cancelled');
      for (const [key, value] of entries) store.put(value, key);
      for (const key of remove) store.delete(key);
    } catch (error) { transaction.abort(); reject(error); }
  }));
}

/** One IndexedDB transaction writes both the rollback snapshot and all replacements. */
export async function commitImport(plan: ImportPlan, current: unknown, valid: () => boolean): Promise<void> {
  // Revalidate a private clone; neither a changed preview nor a forged plan bypasses validation.
  const checked = inspectImport(plan.original);
  try {
    await withExclusiveStorage(async () => {
      const values = await getMany<unknown>([...DEVICE_KEYS, DEVICE_COPIES_KEY]);
      const previous = Object.fromEntries(DEVICE_KEYS.map((key, i) => [key, values[i]])) as DeviceData;
      if (current !== undefined) previous['gm.current'] = structuredClone(current);
      const copies = decodeDeviceCopies(values[DEVICE_KEYS.length]);
      const copy: DeviceCopy = { version: 1, id: crypto.randomUUID(), createdAt: Date.now(), data: previous, source: checked.original };
      let entries: [IDBValidKey, unknown][];
      if (checked.kind === 'device') entries = DEVICE_KEYS.map((key) => [key, checked.data[key]]);
      else {
        const game = structuredClone(checked.data['gm.current']) as import('./storage').SavedGame;
        // A single imported game is a separate copy and cannot overwrite an archived game by ID.
        game.id = crypto.randomUUID();
        if (game.finishedAt !== undefined) {
          const history = previous['gm.history'] === undefined ? [] : decodeHistory(previous['gm.history']);
          if (history.length >= 500) throw new ImportError('storage');
          entries = [['gm.history', [game, ...history]], ...(current === undefined ? [] : [['gm.current', structuredClone(current)] as [IDBValidKey, unknown]])];
        } else entries = [['gm.current', game]];
      }
      if (!valid() || !mayWrite()) throw new ImportError('cancelled');
      await replaceAtomically([[DEVICE_COPIES_KEY, [copy, ...copies]], ...entries], valid);
    });
  } catch (error) { if (error instanceof ImportError) throw error; throw new ImportError('storage'); }
}

/** History clearing is reversible through a device copy. Full clearing retains no personal data. */
export async function commitClear(scope: 'history' | 'all', current: unknown, valid: () => boolean): Promise<void> {
  try {
    await withExclusiveStorage(async () => {
      if (scope === 'all') {
        await replaceAtomically([], valid, [...DEVICE_KEYS, DEVICE_COPIES_KEY]);
        return;
      }
      const values = await getMany<unknown>([...DEVICE_KEYS, DEVICE_COPIES_KEY]);
      const previous = Object.fromEntries(DEVICE_KEYS.map((key, i) => [key, values[i]])) as DeviceData;
      if (current !== undefined) previous['gm.current'] = structuredClone(current);
      const copies = decodeDeviceCopies(values[DEVICE_KEYS.length]);
      const copy: DeviceCopy = { version: 1, id: crypto.randomUUID(), createdAt: Date.now(), data: previous, source: null, operation: 'history-clear' };
      await replaceAtomically([[DEVICE_COPIES_KEY, [copy, ...copies]], ['gm.history', []], ...(current === undefined ? [] : [['gm.current', structuredClone(current)] as [IDBValidKey, unknown]])], valid);
    }, scope === 'all');
  } catch (error) { if (error instanceof ImportError) throw error; throw new ImportError('storage'); }
}
