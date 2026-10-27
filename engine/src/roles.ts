// Roles, teams, recommended compositions and composition validation (GAME_DESIGN.md §4–5).

import type { Composition, Role, Team } from './types';

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 20;
/** Seat numbers come from table cards 1–20 and need not be consecutive. */
export const MAX_SEAT = 20;

export const ROLES: readonly Role[] = ['civilian', 'mafia', 'don', 'commissar', 'doctor', 'lover', 'maniac'];

/** Roles that can appear at most once. */
export const SINGLE_ROLES: readonly Role[] = ['don', 'commissar', 'doctor', 'lover', 'maniac'];

export const ROLE_TEAM: Record<Role, Team> = {
  civilian: 'town',
  mafia: 'mafia',
  don: 'mafia',
  commissar: 'town',
  doctor: 'town',
  lover: 'town',
  maniac: 'maniac',
};

export const ROLE_NAME: Record<Role, string> = {
  civilian: 'Мирный житель',
  mafia: 'Мафия',
  don: 'Дон мафии',
  commissar: 'Комиссар',
  doctor: 'Доктор',
  lover: 'Любовница',
  maniac: 'Маньяк',
};

export const TEAM_NAME: Record<Team, string> = {
  town: 'Город',
  mafia: 'Мафия',
  maniac: 'Маньяк',
};

// [mafia team incl. the Don, commissar, doctor, lover, maniac]; the rest are civilians. Table from §5.1.
// The Don is in the game as soon as the mafia team has two or more members.
const TABLE: Record<number, [number, number, number, number, number]> = {
  5: [1, 1, 0, 0, 0],
  6: [2, 1, 0, 0, 0],
  7: [2, 1, 1, 0, 0],
  8: [2, 1, 1, 0, 0],
  9: [2, 1, 1, 1, 0],
  10: [3, 1, 1, 1, 0],
  11: [3, 1, 1, 1, 1],
  12: [3, 1, 1, 1, 1],
  13: [3, 1, 1, 1, 1],
  14: [4, 1, 1, 1, 1],
  15: [4, 1, 1, 1, 1],
  16: [4, 1, 1, 1, 1],
  17: [5, 1, 1, 1, 1],
  18: [5, 1, 1, 1, 1],
  19: [5, 1, 1, 1, 1],
  20: [6, 1, 1, 1, 1],
};

export function emptyComposition(): Composition {
  return { civilian: 0, mafia: 0, don: 0, commissar: 0, doctor: 0, lover: 0, maniac: 0 };
}

export function compositionTotal(c: Composition): number {
  return ROLES.reduce((sum, r) => sum + c[r], 0);
}

export function recommendedComposition(players: number): Composition {
  const row = TABLE[players];
  if (!row) {
    throw new RangeError(`Игроков должно быть от ${MIN_PLAYERS} до ${MAX_PLAYERS}`);
  }
  const [team, commissar, doctor, lover, maniac] = row;
  const don = team >= 2 ? 1 : 0;
  return {
    mafia: team - don,
    don,
    commissar,
    doctor,
    lover,
    maniac,
    civilian: players - team - commissar - doctor - lover - maniac,
  };
}

export interface CompositionIssue {
  code: string;
  message: string;
  params?: Record<string, string | number>;
}

export interface CompositionCheck {
  errors: CompositionIssue[];
  warnings: CompositionIssue[];
  balance: 'town' | 'balanced' | 'mafia';
}

/** §5.2 */
export function validateComposition(players: number, c: Composition): CompositionCheck {
  const errors: CompositionIssue[] = [];
  const warnings: CompositionIssue[] = [];

  if (!Number.isInteger(players) || players < MIN_PLAYERS || players > MAX_PLAYERS) {
    errors.push({ code: 'players.range', message: `Игроков должно быть от ${MIN_PLAYERS} до ${MAX_PLAYERS}`, params: { min: MIN_PLAYERS, max: MAX_PLAYERS } });
  }
  for (const r of ROLES) {
    if (!Number.isInteger(c[r]) || c[r] < 0) {
      errors.push({ code: 'role.negative', message: `Неверное количество: ${ROLE_NAME[r]}`, params: { role: r } });
    }
  }
  if (compositionTotal(c) !== players) {
    errors.push({
      code: 'composition.total',
      message: `Ролей ${compositionTotal(c)}, а игроков ${players}`,
      params: { roles: compositionTotal(c), players },
    });
  }
  if (c.mafia + c.don < 1) {
    errors.push({ code: 'composition.noMafia', message: 'Нужна хотя бы одна мафия: мафиози или дон' });
  }
  for (const r of SINGLE_ROLES) {
    if (c[r] > 1) {
      errors.push({ code: 'composition.single', message: `${ROLE_NAME[r]} может быть только один`, params: { role: r } });
    }
  }
  const town = c.civilian + c.commissar + c.doctor + c.lover;
  if (c.mafia + c.don + c.maniac >= town) {
    errors.push({
      code: 'composition.startWin',
      message: 'Мафии и маньяка вместе должно быть меньше, чем мирных — иначе игра закончится, не начавшись',
    });
  }
  if (c.civilian === 0) {
    warnings.push({ code: 'composition.noCivilians', message: 'В игре нет ни одного мирного жителя' });
  }

  return { errors, warnings, balance: balanceHint(players, c) };
}

/**
 * Rough heuristic comparing with the recommended table.
 * To be tuned after playtests (§21, stage 4).
 */
export function balanceHint(players: number, c: Composition): 'town' | 'balanced' | 'mafia' {
  const row = TABLE[players];
  if (!row) return 'balanced';
  const rec = recommendedComposition(players);
  const evil = (x: Composition) => x.mafia + x.don + 0.5 * x.maniac;
  const helpers = (x: Composition) => 0.5 * (x.commissar + x.doctor + x.lover);
  const delta = evil(c) - helpers(c) - (evil(rec) - helpers(rec));
  if (delta >= 1) return 'mafia';
  if (delta <= -1) return 'town';
  return 'balanced';
}
