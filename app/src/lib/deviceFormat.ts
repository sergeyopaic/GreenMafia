import { decodeHistory, decodePlayers, decodePrefs, decodeSetup, inspectGame, isRecord } from './saveFormat';
import { decodeBackups } from './backups';
import { runtimeFor } from './gameRuntime';
import { normalizeName, MAX_NAME } from './players';
import { decodeRuleProfiles } from './ruleProfiles';
import type { SavedGame } from './storage';

export const DEVICE_KEYS = ['gm.current', 'gm.history', 'gm.players', 'gm.lastSetup', 'gm.prefs', 'gm.backups', 'gm.ruleProfiles'] as const;
export const DEVICE_COPIES_KEY = 'gm.deviceCopies';
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
export type DeviceData = Partial<Record<(typeof DEVICE_KEYS)[number], unknown>>;
export interface ImportPlan {
  kind: 'device' | 'game';
  original: unknown;
  data: DeviceData;
  profiles: number;
  games: number;
  backups: number;
  /** Saved rule profiles in the file (they replace the device's profiles). */
  rules: number;
  hasCurrent: boolean;
}
export class ImportError extends Error {
  constructor(public code: 'invalid' | 'future' | 'large' | 'storage' | 'cancelled') { super(code); }
}

function checkedGame(raw: unknown): SavedGame {
  const inspected = inspectGame(raw);
  if (inspected.kind === 'future') throw new ImportError('future');
  if (inspected.kind !== 'ready' || inspected.dropped > 0) throw new ImportError('invalid');
  return { ...inspected.saved, runtime: runtimeFor(inspected.game.state, inspected.saved.runtime, true) };
}

/** No data is written and the supplied object is never mutated during preview. */
export function inspectImport(raw: unknown): ImportPlan {
  try {
    if (!isRecord(raw)) throw new ImportError('invalid');
    const original = structuredClone(raw);
    if (raw.format !== undefined) {
      if (raw.format !== 'greenmafia-device-backup') throw new ImportError('invalid');
      if (raw.version !== 1) throw new ImportError(typeof raw.version === 'number' && raw.version > 1 ? 'future' : 'invalid');
      if (!isRecord(raw.data) || !Number.isFinite(raw.exportedAt) || (raw.exportedAt as number) < 0
        || Object.keys(raw.data).some((key) => !DEVICE_KEYS.includes(key as typeof DEVICE_KEYS[number]))) throw new ImportError('invalid');
      const data = structuredClone(raw.data) as DeviceData;
      let hasCurrent = false;
      if (data['gm.current'] !== undefined) {
        const game = checkedGame(data['gm.current']);
        data['gm.current'] = game;
        const current = inspectGame(game);
        hasCurrent = current.kind === 'ready' && current.game.state.phase.t !== 'gameOver';
      }
      const history = data['gm.history'] === undefined ? [] : decodeHistory(data['gm.history']);
      if (history.length > 500 || history.some((g) => inspectGame(g).kind !== 'ready' || g.finishedAt === undefined)) throw new ImportError('invalid');
      const current = data['gm.current'] as SavedGame | undefined;
      const duplicate = current && history.find((g) => g.id === current.id);
      if (duplicate && (hasCurrent || JSON.stringify(duplicate.events) !== JSON.stringify(current!.events))) throw new ImportError('invalid');
      if (current && !hasCurrent && (!duplicate || current.finishedAt === undefined)) throw new ImportError('invalid');
      const profiles = data['gm.players'] === undefined ? [] : decodePlayers(data['gm.players']);
      if (profiles.some((p) => p.name.length > MAX_NAME) || new Set(profiles.map((p) => normalizeName(p.name))).size !== profiles.length) throw new ImportError('invalid');
      const backups = data['gm.backups'] === undefined ? [] : decodeBackups(data['gm.backups']);
      const rules = data['gm.ruleProfiles'] === undefined ? [] : decodeRuleProfiles(data['gm.ruleProfiles']);
      data['gm.history'] = history; data['gm.players'] = profiles; data['gm.backups'] = backups; data['gm.ruleProfiles'] = rules;
      if (data['gm.prefs'] !== undefined) data['gm.prefs'] = decodePrefs(data['gm.prefs']);
      if (data['gm.lastSetup'] !== undefined) data['gm.lastSetup'] = decodeSetup(data['gm.lastSetup']);
      return { kind: 'device', original, data, profiles: profiles.length, games: history.length, backups: backups.length, rules: rules.length, hasCurrent };
    }
    const game = checkedGame(raw);
    const inspected = inspectGame(game);
    const finished = inspected.kind === 'ready' && inspected.game.state.phase.t === 'gameOver';
    if (finished) game.finishedAt ??= Date.now();
    return { kind: 'game', original, data: { 'gm.current': game }, profiles: 0, games: finished ? 1 : 0, backups: 0, rules: 0, hasCurrent: !finished };
  } catch (error) { if (error instanceof ImportError) throw error; throw new ImportError('invalid'); }
}

export async function readImportFile(file: Pick<File, 'size' | 'text'>): Promise<ImportPlan> {
  if (file.size > MAX_IMPORT_BYTES) throw new ImportError('large');
  try {
    const text = await file.text();
    if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) throw new ImportError('large');
    return inspectImport(JSON.parse(text.replace(/^\uFEFF/, '')));
  } catch (error) { if (error instanceof ImportError) throw error; throw new ImportError('invalid'); }
}

export interface DeviceCopy { version: 1; id: string; createdAt: number; data: DeviceData; source: unknown; operation?: 'import' | 'history-clear' }
/** Local recovery snapshots deliberately exclude this list to prevent recursive backup growth. */
export function decodeDeviceCopies(raw: unknown): DeviceCopy[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || !raw.every((c) => isRecord(c) && c.version === 1 && typeof c.id === 'string' && c.id.length > 0
    && typeof c.createdAt === 'number' && Number.isFinite(c.createdAt) && c.createdAt >= 0 && isRecord(c.data) && Object.hasOwn(c, 'source')
    && (c.operation === undefined || c.operation === 'import' || c.operation === 'history-clear'))
    || new Set(raw.map((c) => c.id)).size !== raw.length) throw new ImportError('storage');
  return raw as DeviceCopy[];
}
