// Persistence in IndexedDB (GAME_DESIGN.md §11.4). Replay the event log; restore UI drafts separately.

import type { Composition, GameEvent, PresetName, Settings } from '@greenmafia/engine';
import { get, set, setMany } from 'idb-keyval';
import type { GameRuntime } from './gameRuntime';
import { readStored, writeStored } from './persistence';
import { decodeHistory, decodePrefs, decodeSetup, historyForUpdate } from './saveFormat';
import type { KeepAwake } from './wakeLock';

export interface SavedGame {
  schemaVersion?: 1;
  id: string;
  createdAt: number;
  finishedAt?: number;
  events: GameEvent[];
  runtime?: GameRuntime;
}

export interface LastSetup {
  names: string[];
  /** Seat numbers (table cards 1–20), parallel to names. */
  seats?: number[];
  count: number;
  preset: PresetName | 'custom';
  settings: Settings;
  composition?: Composition;
  dealing: 'app' | 'cards';
}

export interface Prefs {
  sound: boolean;
  /** Absent in older saves: use their sound setting to preserve the previous haptics preference. */
  vibration?: boolean;
  /** Interface language; absent = detect from the browser. */
  lang?: 'ru' | 'en';
  /** The short introduction was explicitly completed or dismissed. */
  introSeen?: boolean;
  /** When the screen stays on; absent = `game` (the behaviour before this setting existed). */
  keepAwake?: KeepAwake;
}

const K_CURRENT = 'gm.current';
const K_HISTORY = 'gm.history';
const K_SETUP = 'gm.lastSetup';
const K_PREFS = 'gm.prefs';
const HISTORY_LIMIT = 500;
// Keep uncommitted archive changes when a later game supersedes a failed save.
const pendingHistory = new Map<string, SavedGame | null>();

export const loadCurrent = () => readStored<unknown>(K_CURRENT, undefined);

export const loadHistory = () => readStored<SavedGame[]>(K_HISTORY, [], decodeHistory);

/** Current game and its finished-history entry change in the same transaction. */
export function saveGame(g: SavedGame, close = false): Promise<boolean> {
  pendingHistory.set(g.id, g.finishedAt !== undefined ? g : null);
  const changes = [...pendingHistory];
  return writeStored('game', async () => {
    const rawHistory = await get<unknown>(K_HISTORY);
    let next = rawHistory === undefined ? [] : historyForUpdate(rawHistory);
    for (const [id, entry] of changes) {
      next = next.filter((x) => x.id !== id);
      if (entry) next.unshift(entry);
    }
    await setMany([[K_CURRENT, close ? undefined : g], [K_HISTORY, next.slice(0, HISTORY_LIMIT)]]);
    for (const [id, entry] of changes) {
      if (pendingHistory.get(id) === entry) pendingHistory.delete(id);
    }
  });
}

export const loadLastSetup = () => readStored<LastSetup | undefined>(K_SETUP, undefined, decodeSetup);
export const saveLastSetup = (s: LastSetup) => writeStored('setup', () => set(K_SETUP, s));

export const loadPrefs = () => readStored<Prefs>(K_PREFS, { sound: true }, decodePrefs);
export const savePrefs = (p: Prefs) => writeStored('prefs', () => set(K_PREFS, p));

