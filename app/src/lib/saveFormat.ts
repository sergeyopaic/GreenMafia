import { CLASSIC_SETTINGS, ROLES, replayTolerant, type Composition, type Game, type GameEvent, type Settings } from '@greenmafia/engine';
import type { LastSetup, Prefs, SavedGame } from './storage';
import type { PlayerProfile } from './players';
import { isKeepAwake } from './wakeLock';

export const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const integer = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const timestamp = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 8.64e15;
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && !['__proto__', 'constructor', 'prototype'].includes(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** Missing settings are migrated; an explicitly invalid value is never silently defaulted. */
export function decodeSettings(value: unknown): Settings | null {
  if (!isRecord(value)) return null;
  const result = { ...CLASSIC_SETTINGS, timers: { ...CLASSIC_SETTINGS.timers } };
  const enums: Record<string, readonly string[]> = {
    firstNight: ['meeting', 'full'], commissarManiacResult: ['notMafia', 'mafia'],
    revealRoleOnDeath: ['none', 'team', 'full'], speakingOrder: ['rotating', 'fromFirst'],
    tieRule: ['sports', 'revoteThenNobody', 'nobody'],
  };
  for (const key of Object.keys(CLASSIC_SETTINGS) as (keyof Settings)[]) {
    const v = value[key];
    if (v === undefined) continue;
    if (key === 'timers') {
      if (!isRecord(v)) return null;
      for (const timer of ['speech', 'defense', 'lastWord'] as const) {
        if (v[timer] === undefined) continue;
        if (!integer(v[timer], 0, 3600)) return null;
        result.timers[timer] = v[timer];
      }
    } else if (typeof CLASSIC_SETTINGS[key] === 'boolean') {
      if (typeof v !== 'boolean') return null;
      Object.assign(result, { [key]: v });
    } else if (enums[key]) {
      if (typeof v !== 'string' || !enums[key].includes(v)) return null;
      Object.assign(result, { [key]: v });
    } else if (key === 'doctorSelfHealLimit') {
      if (v !== null && !integer(v, 0, 20)) return null;
      result.doctorSelfHealLimit = v;
    } else if (key === 'minWakeSeconds') {
      if (!integer(v, 0, 3600)) return null;
      result.minWakeSeconds = v;
    }
  }
  return result;
}

function composition(value: unknown): Composition | null {
  if (!isRecord(value)) return null;
  const result = {} as Composition;
  for (const role of ROLES) {
    // The original six-role format did not contain the Don.
    const n = value[role] === undefined && role === 'don' ? 0 : value[role];
    if (!integer(n, 0, 20)) return null;
    result[role] = n;
  }
  return result;
}

function event(value: unknown): GameEvent | null {
  if (!isRecord(value)) return null;
  switch (value.type) {
    case 'CreateGame': {
      const settings = decodeSettings(value.settings);
      const comp = composition(value.composition);
      if (!settings || !comp || !Array.isArray(value.players) || value.players.length < 5 || value.players.length > 20
        || !value.players.every((p) => isRecord(p) && id(p.id) && typeof p.name === 'string' && (p.seat === undefined || integer(p.seat, 1, 20)))
        || !['app', 'cards'].includes(value.dealing as string)
        || (value.dealing === 'app' && !id(value.seed))
        || (value.dealing === 'cards' && (!Array.isArray(value.roles) || !value.roles.every((r) => ROLES.includes(r))))) return null;
      return { ...value, settings, composition: comp } as unknown as GameEvent;
    }
    case 'Proceed': return { type: 'Proceed' };
    case 'NightChoose': return value.target === null || id(value.target) ? { type: 'NightChoose', target: value.target } : null;
    case 'Nominate': return id(value.candidate) ? { type: 'Nominate', candidate: value.candidate } : null;
    case 'CastVotes': {
      if (value.voters !== undefined && (!isRecord(value.voters) || !Object.entries(value.voters).every(([key, v]) => id(key) && strings(v) && v.every(id)))) return null;
      if (value.counts !== undefined && (!isRecord(value.counts) || !Object.entries(value.counts).every(([key, n]) => id(key) && integer(n, 0, 20)))) return null;
      return value as unknown as GameEvent;
    }
    case 'RemovePlayer': return id(value.playerId) && (value.cause === 'removed' || value.cause === 'left') ? value as unknown as GameEvent : null;
    case 'Foul': return id(value.playerId) ? { type: 'Foul', playerId: value.playerId } : null;
    case 'ChangeSeat': return id(value.playerId) && integer(value.seat, 1, 20) ? value as unknown as GameEvent : null;
    case 'RenamePlayer': return id(value.playerId) && typeof value.name === 'string' ? value as unknown as GameEvent : null;
    case 'ChooseFirstSpeaker': return id(value.playerId) ? { type: 'ChooseFirstSpeaker', playerId: value.playerId } : null;
    case 'EndGame': return value.result === 'draw' || value.result === 'aborted' ? { type: 'EndGame', result: value.result } : null;
    default: return null;
  }
}

export type GameInspection =
  | { kind: 'missing' | 'invalid' | 'future' }
  | { kind: 'ready'; saved: SavedGame; game: Game; dropped: number; migrated: boolean };

/** Inspect untrusted data without changing or discarding its original representation. */
export function inspectGame(raw: unknown): GameInspection {
  if (raw === undefined) return { kind: 'missing' };
  if (!isRecord(raw)) return { kind: 'invalid' };
  if (raw.schemaVersion !== undefined && raw.schemaVersion !== 0 && raw.schemaVersion !== 1) {
    return { kind: typeof raw.schemaVersion === 'number' && Number.isInteger(raw.schemaVersion) && raw.schemaVersion > 1 ? 'future' : 'invalid' };
  }
  if (!id(raw.id) || !timestamp(raw.createdAt) || (raw.finishedAt !== undefined && !timestamp(raw.finishedAt)) || !Array.isArray(raw.events) || !raw.events.length) return { kind: 'invalid' };
  const valid: GameEvent[] = [];
  for (const candidate of raw.events) {
    const parsed = event(candidate);
    if (!parsed) break;
    valid.push(parsed);
  }
  const replay = replayTolerant(valid);
  if (!replay.game) return { kind: 'invalid' };
  const game = replay.game;
  const saved: SavedGame = { schemaVersion: 1, id: raw.id, createdAt: raw.createdAt, events: game.events };
  if (raw.finishedAt !== undefined && game.state.phase.t === 'gameOver') saved.finishedAt = raw.finishedAt;
  // UI data is separately validated against the reconstructed phase when it is opened.
  if (isRecord(raw.runtime)) saved.runtime = raw.runtime as unknown as SavedGame['runtime'];
  const first = raw.events[0];
  const oldSettings = isRecord(first) ? first.settings : null;
  const oldTimers = isRecord(oldSettings) ? oldSettings.timers : null;
  const missingDefaults = !isRecord(oldSettings) || Object.keys(CLASSIC_SETTINGS).some((key) => oldSettings[key] === undefined)
    || !isRecord(oldTimers) || ['speech', 'defense', 'lastWord'].some((key) => oldTimers[key] === undefined);
  const migrated = raw.schemaVersion !== 1 || (isRecord(first) && (
    (isRecord(first.composition) && first.composition.don === undefined)
  )) || missingDefaults;
  return { kind: 'ready', saved, game, dropped: raw.events.length - game.events.length, migrated };
}

export function decodeHistory(raw: unknown): SavedGame[] {
  if (!Array.isArray(raw)) throw new Error('Invalid history');
  const result = raw.map(inspectGame);
  if (result.some((r) => r.kind !== 'ready' || r.dropped > 0)) throw new Error('History needs recovery');
  const games = result.map((r) => (r as Extract<GameInspection, { kind: 'ready' }>).saved);
  if (new Set(games.map((g) => g.id)).size !== games.length) throw new Error('Duplicate history IDs');
  return games;
}

/** Validate the container without replaying up to 500 games on every timer/vote checkpoint.
 * Unchanged entries retain their original representation, including legacy event logs. */
export function historyForUpdate(raw: unknown): SavedGame[] {
  if (!Array.isArray(raw) || !raw.every((g) => isRecord(g) && id(g.id) && timestamp(g.createdAt)
    && (g.finishedAt === undefined || timestamp(g.finishedAt)) && Array.isArray(g.events) && g.events.length > 0
    && (g.schemaVersion === undefined || g.schemaVersion === 0 || g.schemaVersion === 1))
    || new Set(raw.map((g) => g.id)).size !== raw.length) throw new Error('Invalid history container');
  return raw as SavedGame[];
}

export function decodePrefs(raw: unknown): Prefs {
  if (!isRecord(raw) || typeof raw.sound !== 'boolean' || (raw.lang !== undefined && raw.lang !== 'ru' && raw.lang !== 'en')
    || (raw.introSeen !== undefined && typeof raw.introSeen !== 'boolean')
    || (raw.vibration !== undefined && typeof raw.vibration !== 'boolean')
    || (raw.keepAwake !== undefined && !isKeepAwake(raw.keepAwake))) throw new Error('Invalid preferences');
  return { sound: raw.sound, ...(raw.lang ? { lang: raw.lang } : {}), ...(raw.introSeen !== undefined ? { introSeen: raw.introSeen } : {}),
    ...(raw.vibration !== undefined ? { vibration: raw.vibration } : {}), ...(raw.keepAwake !== undefined ? { keepAwake: raw.keepAwake } : {}) };
}

export function decodeSetup(raw: unknown): LastSetup {
  if (!isRecord(raw) || !integer(raw.count, 5, 20) || !strings(raw.names) || raw.names.length !== raw.count
    || !['classic', 'sports', 'custom'].includes(raw.preset as string) || !['app', 'cards'].includes(raw.dealing as string)) throw new Error('Invalid setup');
  const settings = decodeSettings(raw.settings);
  const comp = raw.composition === undefined ? undefined : composition(raw.composition);
  if (!settings || comp === null) throw new Error('Invalid setup rules');
  if (raw.seats !== undefined && (!Array.isArray(raw.seats) || raw.seats.length !== raw.count || !raw.seats.every((s) => integer(s, 1, 20)) || new Set(raw.seats).size !== raw.count)) throw new Error('Invalid setup seats');
  return { ...raw, settings, ...(comp ? { composition: comp } : {}) } as unknown as LastSetup;
}

export function decodePlayers(raw: unknown): PlayerProfile[] {
  if (!Array.isArray(raw) || !raw.every((p) => isRecord(p) && id(p.id) && typeof p.name === 'string' && p.name.trim().length > 0 && timestamp(p.createdAt))
    || new Set(raw.map((p) => p.id)).size !== raw.length) throw new Error('Invalid players');
  return raw as PlayerProfile[];
}
