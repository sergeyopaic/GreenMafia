// Win conditions (GAME_DESIGN.md §9). Rules are checked in order; the first match wins.

import { ROLE_TEAM } from './roles';
import type { GameResult, Player } from './types';

export interface Counts {
  /** Alive mafia. */
  M: number;
  /** 1 if the maniac is alive. */
  K: number;
  /** Alive town players. */
  T: number;
}

export function countAlive(players: readonly Player[]): Counts {
  const c: Counts = { M: 0, K: 0, T: 0 };
  for (const p of players) {
    if (!p.alive) continue;
    const team = ROLE_TEAM[p.role];
    if (team === 'mafia') c.M++;
    else if (team === 'maniac') c.K++;
    else c.T++;
  }
  return c;
}

export function evaluateCounts({ M, K, T }: Counts, earlyWinDetection: boolean): GameResult | null {
  if (M + K + T === 0) return { winner: 'draw', reason: 'allDead' };
  if (M === 0 && K === 0) return { winner: 'town', reason: 'allEvilDead' };
  if (M === 0 && K >= 1 && T <= 1) return { winner: 'maniac', reason: 'maniacLast' };
  if (M >= 1 && K === 0 && M >= T) return { winner: 'mafia', reason: 'parity' };
  if (earlyWinDetection) {
    if (M >= 1 && K >= 1 && M >= T + 2) return { winner: 'mafia', reason: 'mafiaMajority' };
    if (M === 1 && K >= 1 && T === 0) return { winner: 'draw', reason: 'stalemate' };
  }
  return null;
}

export function checkWinner(players: readonly Player[], earlyWinDetection: boolean): GameResult | null {
  return evaluateCounts(countAlive(players), earlyWinDetection);
}
