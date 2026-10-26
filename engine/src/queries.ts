// Read-only helpers for the UI. They never change the state.

import { currentSpeaker, eligibleVoters, hasAlibi, nominationError } from './day';
import { currentNight, findPlayer } from './helpers';
import { commissarResult, currentStep, isStepBlocked, isStepFake, targetError } from './night';
import { ROLE_TEAM } from './roles';
import type { CheckResult, Choice, GameState, NightStep, Player, Role, Team } from './types';

export interface TargetOption {
  player: Player;
  allowed: boolean;
  /** Why the target is not allowed. */
  reason: string | null;
}

export interface NightStepView {
  step: NightStep;
  /** Role is out of the game (or absent with a hidden setup): just wait. */
  fake: boolean;
  /** The lover visited this role: the choice will not work. Host-only information. */
  blocked: boolean;
  choice: Choice | undefined;
  options: TargetOption[];
  index: number;
  total: number;
}

export function getNightStepView(state: GameState): NightStepView | null {
  if (state.phase.t !== 'night') return null;
  const step = currentStep(state);
  const night = currentNight(state);
  const fake = isStepFake(state, step);
  const options: TargetOption[] =
    step === 'meeting'
      ? []
      : state.players.map((p) => {
          const reason = fake ? 'Роль выбыла' : targetError(state, step, p.id);
          return { player: p, allowed: reason === null, reason };
        });
  return {
    step,
    fake,
    blocked: isStepBlocked(state, step),
    choice: step === 'meeting' ? undefined : night.choices[step],
    options,
    index: state.phase.stepIndex,
    total: night.steps.length,
  };
}

/** The answer to show the commissar right after they chose (null if no choice yet). */
export function getCommissarResult(state: GameState): CheckResult | null {
  if (state.nights.length === 0) return null;
  return commissarResult(state, currentNight(state));
}

export interface Identity {
  role: Role | null;
  team: Team | null;
}

/** What players are told about a player who is out, by `revealRoleOnDeath`. Everything is open after the game. */
export function publicIdentity(state: GameState, playerId: string): Identity {
  const p = findPlayer(state, playerId);
  if (!p) return { role: null, team: null };
  const over = state.phase.t === 'gameOver';
  if (over) return { role: p.role, team: ROLE_TEAM[p.role] };
  if (p.alive) return { role: null, team: null };
  switch (state.settings.revealRoleOnDeath) {
    case 'full':
      return { role: p.role, team: ROLE_TEAM[p.role] };
    case 'team':
      return { role: null, team: ROLE_TEAM[p.role] };
    case 'none':
      return { role: null, team: null };
  }
}

export interface MorningReport {
  number: number;
  meeting: boolean;
  deaths: { player: Player; identity: Identity }[];
  alibi: Player | null;
  /** Only when `announceSaves` is on. */
  someoneSaved: boolean;
}

export function getMorningReport(state: GameState): MorningReport | null {
  if (state.nights.length === 0) return null;
  const night = currentNight(state);
  if (!night.resolved) return null;
  return {
    number: night.number,
    meeting: night.kind === 'meeting',
    deaths: night.deaths
      .map((d) => findPlayer(state, d.playerId))
      .filter((p): p is Player => !!p)
      .map((p) => ({ player: p, identity: publicIdentity(state, p.id) })),
    alibi: night.alibiFor ? (findPlayer(state, night.alibiFor) ?? null) : null,
    someoneSaved: state.settings.announceSaves && night.saved.length > 0,
  };
}

/** For the role card during the deal: mafia also sees the partners. */
export function getRoleCard(state: GameState, playerId: string): { role: Role; partners: Player[] } | null {
  const p = findPlayer(state, playerId);
  if (!p) return null;
  const partners = p.role === 'mafia' ? state.players.filter((x) => x.role === 'mafia' && x.id !== p.id) : [];
  return { role: p.role, partners };
}

export function getNominationOptions(state: GameState): TargetOption[] {
  if (state.phase.t !== 'discussion') return [];
  return state.players.map((p) => {
    const reason = nominationError(state, p.id);
    return { player: p, allowed: reason === null, reason };
  });
}

export function getCurrentSpeaker(state: GameState): Player | null {
  return currentSpeaker(state);
}

export function getEligibleVoters(state: GameState): Player[] {
  return eligibleVoters(state);
}

export function playerHasAlibi(state: GameState, playerId: string): boolean {
  return hasAlibi(state, playerId);
}

/** Players of the winning side (including those who are out). */
export function getWinners(state: GameState): Player[] {
  if (state.phase.t !== 'gameOver') return [];
  const w = state.phase.result.winner;
  if (w === 'draw' || w === 'aborted') return [];
  return state.players.filter((p) => ROLE_TEAM[p.role] === w);
}
