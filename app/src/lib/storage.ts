// Persistence in IndexedDB (GAME_DESIGN.md §11.4). Only event logs are stored; the state is replayed.

import type { Composition, GameEvent, PresetName, Settings } from '@greenmafia/engine';
import { del, get, set } from 'idb-keyval';

export interface SavedGame {
  id: string;
  createdAt: number;
  finishedAt?: number;
  events: GameEvent[];
}

export interface LastSetup {
  names: string[];
  count: number;
  preset: PresetName | 'custom';
  settings: Settings;
  composition?: Composition;
  dealing: 'app' | 'cards';
}

export interface Prefs {
  sound: boolean;
}

const K_CURRENT = 'gm.current';
const K_HISTORY = 'gm.history';
const K_SETUP = 'gm.lastSetup';
const K_PREFS = 'gm.prefs';
const HISTORY_LIMIT = 50;

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export const loadCurrent = () => safe(() => get<SavedGame>(K_CURRENT), undefined);
export const saveCurrent = (g: SavedGame) => safe(() => set(K_CURRENT, g), undefined);
export const clearCurrent = () => safe(() => del(K_CURRENT), undefined);

export const loadHistory = async () => (await safe(() => get<SavedGame[]>(K_HISTORY), undefined)) ?? [];

export async function upsertHistory(g: SavedGame): Promise<void> {
  const list = (await loadHistory()).filter((x) => x.id !== g.id);
  list.unshift(g);
  await safe(() => set(K_HISTORY, list.slice(0, HISTORY_LIMIT)), undefined);
}

export async function removeHistory(id: string): Promise<void> {
  const list = await loadHistory();
  if (!list.some((x) => x.id === id)) return;
  await safe(() => set(K_HISTORY, list.filter((x) => x.id !== id)), undefined);
}

export const loadLastSetup = () => safe(() => get<LastSetup>(K_SETUP), undefined);
export const saveLastSetup = (s: LastSetup) => safe(() => set(K_SETUP, s), undefined);

export const loadPrefs = async (): Promise<Prefs> => (await safe(() => get<Prefs>(K_PREFS), undefined)) ?? { sound: true };
export const savePrefs = (p: Prefs) => safe(() => set(K_PREFS, p), undefined);

