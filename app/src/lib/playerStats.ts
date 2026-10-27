// Player statistics computed from the finished games in the history. Nothing is stored separately:
// the history is the source of truth, so stats stay correct after undo or deleting a game.

import { type GameResult, type GameState, type Player, ROLES, ROLE_TEAM, type Role, type Team, replayTolerant } from '@greenmafia/engine';
import { type PlayerProfile, isProfileId, normalizeName } from './players';
import type { SavedGame } from './storage';

export interface GameEntry {
  saved: SavedGame;
  state: GameState;
  result: GameResult;
  date: number;
}

export interface PlayerGame {
  saved: SavedGame;
  date: number;
  seat: number;
  role: Role;
  team: Team;
  result: GameResult;
  won: boolean;
  survived: boolean;
  deathCause: string | null;
}

export interface TeamStat {
  games: number;
  wins: number;
}

export interface PlayerStats {
  games: number;
  wins: number;
  draws: number;
  /** 0..1, null without games. */
  winRate: number | null;
  byTeam: Record<Team, TeamStat>;
  roles: Record<Role, number>;
  favoriteRole: Role | null;
  survived: number;
  killedAtNight: number;
  exiled: number;
  removed: number;
  lastPlayed: number | null;
  /** Newest first. */
  history: PlayerGame[];
}

/** Replays the history once; keeps only finished games with a result (not aborted). */
export function finishedGames(history: readonly SavedGame[]): GameEntry[] {
  const out: GameEntry[] = [];
  for (const saved of history) {
    const r = replayTolerant(saved.events);
    if (!r.game || r.game.state.phase.t !== 'gameOver') continue;
    const result = r.game.state.phase.result;
    if (result.winner === 'aborted') continue;
    out.push({ saved, state: r.game.state, result, date: saved.finishedAt ?? saved.createdAt });
  }
  return out.sort((a, b) => b.date - a.date);
}

/**
 * Finds the profile's seat in a game: by profile id, or — for games played before the base existed
 * (ids like `p3`) — by name.
 */
export function findPlayerInGame(state: GameState, profile: PlayerProfile): Player | undefined {
  const byId = state.players.find((p) => p.id === profile.id);
  if (byId) return byId;
  const key = normalizeName(profile.name);
  return state.players.find((p) => !isProfileId(p.id) && normalizeName(p.name) === key);
}

const emptyRoles = (): Record<Role, number> => Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<Role, number>;

export function playerStats(profile: PlayerProfile, games: readonly GameEntry[]): PlayerStats {
  const stats: PlayerStats = {
    games: 0,
    wins: 0,
    draws: 0,
    winRate: null,
    byTeam: { town: { games: 0, wins: 0 }, mafia: { games: 0, wins: 0 }, maniac: { games: 0, wins: 0 } },
    roles: emptyRoles(),
    favoriteRole: null,
    survived: 0,
    killedAtNight: 0,
    exiled: 0,
    removed: 0,
    lastPlayed: null,
    history: [],
  };

  for (const g of games) {
    const p = findPlayerInGame(g.state, profile);
    if (!p) continue;
    const team = ROLE_TEAM[p.role];
    const won = g.result.winner === team;
    stats.games++;
    stats.byTeam[team].games++;
    stats.roles[p.role]++;
    if (won) {
      stats.wins++;
      stats.byTeam[team].wins++;
    }
    if (g.result.winner === 'draw') stats.draws++;
    if (p.alive) stats.survived++;
    const cause = p.death?.cause ?? null;
    if (cause === 'night' || cause === 'loverLink') stats.killedAtNight++;
    else if (cause === 'vote') stats.exiled++;
    else if (cause === 'removed' || cause === 'left') stats.removed++;
    stats.lastPlayed = Math.max(stats.lastPlayed ?? 0, g.date);
    stats.history.push({
      saved: g.saved,
      date: g.date,
      seat: p.seat,
      role: p.role,
      team,
      result: g.result,
      won,
      survived: p.alive,
      deathCause: cause,
    });
  }

  stats.winRate = stats.games > 0 ? stats.wins / stats.games : null;
  let best: Role | null = null;
  for (const r of ROLES) if (stats.roles[r] > 0 && (best === null || stats.roles[r] > stats.roles[best])) best = r;
  stats.favoriteRole = best;
  stats.history.sort((a, b) => b.date - a.date);
  return stats;
}

export function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}
