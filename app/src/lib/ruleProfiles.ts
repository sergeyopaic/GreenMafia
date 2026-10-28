// Rule profiles: the host's own named sets of game rules, stored on the device next to Classic and Sports.

import { set } from 'idb-keyval';
import type { Settings } from '@greenmafia/engine';
import { readStored, writeStored } from './persistence';
import { decodeSettings, isRecord } from './saveFormat';

export interface RuleProfile {
  id: string;
  name: string;
  settings: Settings;
  createdAt: number;
  updatedAt: number;
}

export const RULE_PROFILES_KEY = 'gm.ruleProfiles';
export const MAX_RULE_PROFILES = 30;
export const MAX_PROFILE_NAME = 24;

export type ProfileNameError = 'empty' | 'exists' | 'reserved' | 'full';

export const cleanProfileName = (name: string) => name.trim().replace(/\s+/g, ' ').slice(0, MAX_PROFILE_NAME);
const nameKey = (name: string) => cleanProfileName(name).toLocaleLowerCase();

/** Same rules regardless of key order or of how the settings object was built. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const sameSettings = (a: Settings, b: Settings) => canonical(a) === canonical(b);

/** The saved profile whose rules are exactly the current ones, if any. */
export const matchProfile = (list: readonly RuleProfile[], settings: Settings) => list.find((p) => sameSettings(p.settings, settings));

/**
 * Why a name cannot be used, or null.
 * `reserved` are the built-in set names (Classic, Sports, Custom in every language) so a profile never looks like one.
 */
export function profileNameError(list: readonly RuleProfile[], name: string, reserved: readonly string[], selfId?: string): ProfileNameError | null {
  const key = nameKey(name);
  if (!key) return 'empty';
  if (reserved.some((r) => nameKey(r) === key)) return 'reserved';
  if (list.some((p) => p.id !== selfId && nameKey(p.name) === key)) return 'exists';
  if (!selfId && list.length >= MAX_RULE_PROFILES) return 'full';
  return null;
}

export function createProfile(list: readonly RuleProfile[], name: string, settings: Settings, now = Date.now()): RuleProfile[] {
  const profile: RuleProfile = { id: crypto.randomUUID(), name: cleanProfileName(name), settings: structuredClone(settings), createdAt: now, updatedAt: now };
  return [...list, profile];
}
export const renameProfile = (list: readonly RuleProfile[], id: string, name: string, now = Date.now()) =>
  list.map((p) => (p.id === id ? { ...p, name: cleanProfileName(name), updatedAt: now } : p));
export const updateProfileRules = (list: readonly RuleProfile[], id: string, settings: Settings, now = Date.now()) =>
  list.map((p) => (p.id === id ? { ...p, settings: structuredClone(settings), updatedAt: now } : p));
export const removeProfile = (list: readonly RuleProfile[], id: string) => list.filter((p) => p.id !== id);

const timestamp = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Strict check for stored and imported data; rules are normalised like any saved game settings. */
export function decodeRuleProfiles(raw: unknown): RuleProfile[] {
  if (!Array.isArray(raw) || raw.length > MAX_RULE_PROFILES) throw new Error('Invalid rule profiles');
  const list = raw.map((p) => {
    if (!isRecord(p) || typeof p.id !== 'string' || !p.id || typeof p.name !== 'string' || !cleanProfileName(p.name)
      || p.name.length > MAX_PROFILE_NAME || !timestamp(p.createdAt) || !timestamp(p.updatedAt)) throw new Error('Invalid rule profile');
    const settings = decodeSettings(p.settings);
    if (!settings) throw new Error('Invalid rule profile settings');
    return { id: p.id, name: p.name, settings, createdAt: p.createdAt as number, updatedAt: p.updatedAt as number };
  });
  if (new Set(list.map((p) => p.id)).size !== list.length || new Set(list.map((p) => nameKey(p.name))).size !== list.length) {
    throw new Error('Duplicate rule profiles');
  }
  return list;
}

export const loadRuleProfiles = () => readStored<RuleProfile[]>(RULE_PROFILES_KEY, [], decodeRuleProfiles);
export const saveRuleProfiles = (list: RuleProfile[]) => writeStored('ruleProfiles', () => set(RULE_PROFILES_KEY, list));
