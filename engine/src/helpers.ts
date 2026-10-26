import { fail } from './errors';
import type { DayRecord, DeathCause, GameState, NightRecord, Player, Role } from './types';

export function findPlayer(state: GameState, id: string): Player | undefined {
  return state.players.find((p) => p.id === id);
}

export function getPlayer(state: GameState, id: string): Player {
  const p = findPlayer(state, id);
  if (!p) fail('player.unknown', 'Такого игрока нет');
  return p;
}

export function isAlive(state: GameState, id: string | null | undefined): id is string {
  if (!id) return false;
  return findPlayer(state, id)?.alive === true;
}

export function alivePlayers(state: GameState): Player[] {
  return state.players.filter((p) => p.alive);
}

/** Holder of a single role (alive or not). */
export function holder(state: GameState, role: Role): Player | undefined {
  return state.players.find((p) => p.role === role);
}

export function aliveWithRole(state: GameState, role: Role): Player[] {
  return state.players.filter((p) => p.alive && p.role === role);
}

export function label(p: Player): string {
  return `№${p.seat}`;
}

export function labelOf(state: GameState, id: string): string {
  const p = findPlayer(state, id);
  return p ? label(p) : '?';
}

export function sortBySeat(state: GameState, ids: string[]): string[] {
  const seat = (id: string) => findPlayer(state, id)?.seat ?? 0;
  return [...ids].sort((a, b) => seat(a) - seat(b));
}

export function currentNight(state: GameState): NightRecord {
  const n = state.nights[state.nights.length - 1];
  if (!n) fail('state.noNight', 'Ночь ещё не начиналась');
  return n;
}

export function currentDay(state: GameState): DayRecord {
  const d = state.days[state.days.length - 1];
  if (!d) fail('state.noDay', 'День ещё не начинался');
  return d;
}

export function kill(state: GameState, id: string, cause: DeathCause, phase: 'night' | 'day', number: number): void {
  const p = getPlayer(state, id);
  if (!p.alive) return;
  p.alive = false;
  p.death = { cause, phase, number };
}

/**
 * Next alive player after `playerId` in seating order (clockwise around the table), wrapping around.
 * Seat numbers are only labels and play no part in the order.
 * `playerId = null` gives the first alive player in seating order.
 */
export function nextAliveAfter(state: GameState, playerId: string | null): Player | undefined {
  const n = state.players.length;
  const start = playerId === null ? -1 : state.players.findIndex((p) => p.id === playerId);
  for (let k = 1; k <= n; k++) {
    const p = state.players[(((start + k) % n) + n) % n];
    if (p?.alive) return p;
  }
  return undefined;
}

/** Neutral order for announcements (deaths, last words): by seat number, so it never hints at who killed whom. */
