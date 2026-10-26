// Roles, teams, recommended compositions and composition validation (GAME_DESIGN.md §4–5).

import type { Composition, Role, Team } from './types';

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 20;

export const ROLES: readonly Role[] = ['civilian', 'mafia', 'commissar', 'doctor', 'lover', 'maniac'];

/** Roles that can appear at most once. */
export const SINGLE_ROLES: readonly Role[] = ['commissar', 'doctor', 'lover', 'maniac'];

export const ROLE_TEAM: Record<Role, Team> = {
  civilian: 'town',
  mafia: 'mafia',
  commissar: 'town',
  doctor: 'town',
  lover: 'town',
  maniac: 'maniac',
};

export const ROLE_NAME: Record<Role, string> = {
  civilian: 'Мирный житель',
  mafia: 'Мафия',
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

// [mafia, commissar, doctor, lover, maniac]; the rest are civilians. Table from §5.1.
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
  return { civilian: 0, mafia: 0, commissar: 0, doctor: 0, lover: 0, maniac: 0 };
}

export function compositionTotal(c: Composition): number {
  return ROLES.reduce((sum, r) => sum + c[r], 0);
}

export function recommendedComposition(players: number): Composition {
  const row = TABLE[players];
  if (!row) {
    throw new RangeError(`Игроков должно быть от ${MIN_PLAYERS} до ${MAX_PLAYERS}`);
  }
  const [mafia, commissar, doctor, lover, maniac] = row;
  return {
    mafia,
    commissar,
    doctor,
    lover,
    maniac,
    civilian: players - mafia - commissar - doctor - lover - maniac,
  };
}

export interface CompositionIssue {
  code: string;
  message: string;
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
    errors.push({ code: 'players.range', message: `Игроков должно быть от ${MIN_PLAYERS} до ${MAX_PLAYERS}` });
  }
  for (const r of ROLES) {
    if (!Number.isInteger(c[r]) || c[r] < 0) {
      errors.push({ code: 'role.negative', message: `Неверное количество: ${ROLE_NAME[r]}` });
    }
  }
  if (compositionTotal(c) !== players) {
    errors.push({
      code: 'composition.total',
      message: `Ролей ${compositionTotal(c)}, а игроков ${players}`,
    });
  }
  if (c.mafia < 1) {
    errors.push({ code: 'composition.noMafia', message: 'Нужна хотя бы одна мафия' });
  }
  for (const r of SINGLE_ROLES) {
    if (c[r] > 1) {
      errors.push({ code: 'composition.single', message: `${ROLE_NAME[r]} может быть только один` });
    }
  }
  const town = c.civilian + c.commissar + c.doctor + c.lover;
  if (c.mafia + c.maniac >= town) {
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
  const evil = (x: Composition) => x.mafia + 0.5 * x.maniac;
  const helpers = (x: Composition) => 0.5 * (x.commissar + x.doctor + x.lover);
  const delta = evil(c) - helpers(c) - (evil(rec) - helpers(rec));
  if (delta >= 1) return 'mafia';
  if (delta <= -1) return 'town';
  return 'balanced';
}
