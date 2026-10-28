import { get } from 'idb-keyval';
import { create } from 'zustand';
import { mayWrite } from './tabOwnership';

interface StorageHealth {
  pending: number;
  writeErrors: string[];
  readErrors: string[];
  lastSavedAt: number | null;
}

export const useStorageHealth = create<StorageHealth>(() => ({ pending: 0, writeErrors: [], readErrors: [], lastSavedAt: null }));

let queue: Promise<unknown> = Promise.resolve();
const revisions = new Map<string, number>();
const failed = new Map<string, () => Promise<void>>();
let exclusive = false;
let sealed = false;

function publishFailures(): void {
  useStorageHealth.setState({ writeErrors: [...failed.keys()] });
}

/** A failed read must never be treated as permission to overwrite an empty database. */
export async function readStored<T>(key: string, fallback: T, decode?: (raw: unknown) => T): Promise<T> {
  try {
    const raw = await get<unknown>(key);
    const value = raw === undefined ? fallback : decode ? decode(raw) : raw as T;
    useStorageHealth.setState((s) => ({ readErrors: s.readErrors.filter((k) => k !== key) }));
    return value;
  } catch {
    useStorageHealth.setState((s) => ({ readErrors: [...new Set([...s.readErrors, key])] }));
    return fallback;
  }
}

/** Serialize writes and retry only the latest failed snapshot for each data set. */
export function writeStored(key: string, operation: () => Promise<void>, retry = false): Promise<boolean> {
  if (exclusive || sealed) return Promise.resolve(false);
  const revision = (revisions.get(key) ?? 0) + 1;
  revisions.set(key, revision);
  // A newer intent supersedes an older failed write, including a queued retry.
  failed.delete(key);
  publishFailures();
  useStorageHealth.setState((s) => ({ pending: s.pending + 1 }));
  const work = queue.then(async () => {
    // An obsolete retry must not resurrect an older state after a newer action.
    if (retry && revision !== revisions.get(key)) return true;
    try {
      if (!mayWrite()) throw new Error('This page does not own device writes');
      if (useStorageHealth.getState().readErrors.length) throw new Error('Read recovery required');
      await operation();
      if (revision === revisions.get(key)) failed.delete(key);
      useStorageHealth.setState({ lastSavedAt: Date.now() });
      return true;
    } catch {
      if (revision === revisions.get(key)) failed.set(key, operation);
      return false;
    } finally {
      publishFailures();
    }
  }).finally(() => useStorageHealth.setState((s) => ({ pending: s.pending - 1 })));
  queue = work;
  return work;
}

export async function retryStorage(): Promise<void> {
  const retry = [...failed.entries()];
  await Promise.all(retry.map(([key, operation]) => writeStored(key, operation, true)));
}

/** Tests and page lifecycle checks can wait for the current write queue. */
export async function flushStorage(): Promise<void> {
  await queue;
}

/** Wait for existing saves, then hold off all new writes for an atomic data replacement.
 * Failed imports are never added to automatic retries: they need a new confirmation. */
export function withExclusiveStorage<T>(operation: () => Promise<T>, allowUnhealthy = false): Promise<T> {
  if (exclusive || sealed) return Promise.reject(new Error('Storage is busy'));
  exclusive = true;
  useStorageHealth.setState((s) => ({ pending: s.pending + 1 }));
  const work = queue.then(async () => {
    const health = useStorageHealth.getState();
    if (!mayWrite() || (!allowUnhealthy && (health.readErrors.length || health.writeErrors.length))) throw new Error('Storage needs recovery');
    return operation();
  }).finally(() => { exclusive = false; useStorageHealth.setState((s) => ({ pending: s.pending - 1 })); });
  queue = work.then(() => {}, () => {});
  return work;
}

/** After replacement, stale callbacks and even a previously failed retry must wait for reload. */
export function sealStorageWrites(): void { sealed = true; }
