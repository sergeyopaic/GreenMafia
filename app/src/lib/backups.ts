import { get, set } from 'idb-keyval';
import { readStored, writeStored } from './persistence';
import { isRecord } from './saveFormat';

const KEY = 'gm.backups';
export interface GameBackup {
  version: 1;
  id: string;
  createdAt: number;
  reason: 'recovery' | 'migration' | 'replacement';
  original: unknown;
}

export function decodeBackups(raw: unknown): GameBackup[] {
  if (!Array.isArray(raw) || !raw.every((b) => isRecord(b) && b.version === 1 && typeof b.id === 'string' && b.id.length > 0
    && typeof b.createdAt === 'number' && Number.isFinite(b.createdAt) && b.createdAt >= 0 && b.createdAt <= 8.64e15 && ['recovery', 'migration', 'replacement'].includes(b.reason as string)
    && Object.hasOwn(b, 'original')) || new Set(raw.map((b) => b.id)).size !== raw.length) throw new Error('Invalid backups');
  return raw as GameBackup[];
}

export const loadBackups = () => readStored<GameBackup[]>(KEY, [], decodeBackups);

/** The original is cloned before the first await; a failed backup never authorizes replacement. */
export function backupGame(original: unknown, reason: GameBackup['reason']): Promise<boolean> {
  const backup: GameBackup = { version: 1, id: crypto.randomUUID(), createdAt: Date.now(), reason, original: structuredClone(original) };
  // A later successful attempt supersedes a failed attempt at the same guarded transition.
  return writeStored('backups', async () => {
    const raw = await get<unknown>(KEY);
    const all = raw === undefined ? [] : decodeBackups(raw);
    // A retry of a completed request cannot create a second copy.
    await set(KEY, [backup, ...all.filter((b) => b.id !== backup.id)]);
  });
}
