// Player database: profiles stored on the device (IndexedDB), linked to games by player id.
// A profile id is used as the in-game player id, so stats survive renames.

import { set } from 'idb-keyval';
import { readStored, writeStored } from './persistence';
import { decodePlayers } from './saveFormat';

export interface PlayerProfile {
  /** Starts with `pl_`; used as the player id inside games. */
  id: string;
  name: string;
  createdAt: number;
}

export const PROFILE_PREFIX = 'pl_';
export const MAX_NAME = 20;

const K_PLAYERS = 'gm.players';

export const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU');

export const isProfileId = (id: string) => id.startsWith(PROFILE_PREFIX);

function newProfileId(): string {
  const rnd = crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${PROFILE_PREFIX}${rnd}`;
}

export function makeProfile(name: string, createdAt = Date.now()): PlayerProfile {
  return { id: newProfileId(), name: cleanName(name), createdAt };
}

export function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME);
}

export function findByName(profiles: readonly PlayerProfile[], name: string): PlayerProfile | undefined {
  const key = normalizeName(name);
  return key ? profiles.find((p) => normalizeName(p.name) === key) : undefined;
}

/** Messages of the player base (the app passes the current language; Russian by default). */
export interface PlayerTexts {
  enterName: string;
  exists: (name: string) => string;
  twice: (name: string) => string;
}

const RU_TEXTS: PlayerTexts = {
  enterName: 'Введите имя',
  exists: (name) => `${name} уже есть в базе`,
  twice: (name) => `${name} записан за столом дважды`,
};

/** Why a name cannot be used for a new or renamed profile, or null. */
export function nameError(
  profiles: readonly PlayerProfile[],
  name: string,
  selfId?: string,
  texts: PlayerTexts = RU_TEXTS,
): string | null {
  const clean = cleanName(name);
  if (!clean) return texts.enterName;
  const same = findByName(profiles, clean);
  if (same && same.id !== selfId) return texts.exists(same.name);
  return null;
}

/**
 * Turns the seat names typed in the setup into game players.
 * Known names reuse their profile; new names become new profiles; empty seats stay guests.
 * The same profile cannot sit twice: a duplicate name is reported as an error.
 */
export function resolveSeats(
  names: readonly string[],
  profiles: readonly PlayerProfile[],
  now = Date.now(),
  texts: PlayerTexts = RU_TEXTS,
): { players: { id: string; name: string }[]; created: PlayerProfile[]; error: string | null } {
  const created: PlayerProfile[] = [];
  const used = new Set<string>();
  const players: { id: string; name: string }[] = [];
  for (const [i, raw] of names.entries()) {
    const name = cleanName(raw);
    if (!name) {
      players.push({ id: `guest_${i + 1}`, name: '' });
      continue;
    }
    let profile = findByName(profiles, name) ?? findByName(created, name);
    if (!profile) {
      profile = makeProfile(name, now);
      created.push(profile);
    }
    if (used.has(profile.id)) {
      return { players: [], created: [], error: texts.twice(profile.name) };
    }
    used.add(profile.id);
    players.push({ id: profile.id, name: profile.name });
  }
  return { players, created, error: null };
}

// ---------- Storage ----------

/** A new device starts empty. Never write initial data over a missing or unreadable base. */
export async function loadPlayers(): Promise<PlayerProfile[]> {
  return readStored<PlayerProfile[]>(K_PLAYERS, [], decodePlayers);
}

export const savePlayers = (list: PlayerProfile[]) => writeStored('players', () => set(K_PLAYERS, list));

export function sortProfiles(list: readonly PlayerProfile[]): PlayerProfile[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}
