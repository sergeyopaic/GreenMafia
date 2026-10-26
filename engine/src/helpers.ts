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

/** Next alive player after `seat`, clockwise (wraps around). */
export function nextAliveAfter(state: GameState, seat: number): Player | undefined {
  const n = state.players.length;
  for (let k = 1; k <= n; k++) {
    const s = ((seat - 1 + k) % n) + 1;
    const p = state.players.find((x) => x.seat === s);
    if (p?.alive) return p;
  }
  return undefined;
}
