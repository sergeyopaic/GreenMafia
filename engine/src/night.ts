// Night phase: wake order, target validation and simultaneous resolution (GAME_DESIGN.md §7).

import { fail } from './errors';
import {
  aliveWithRole,
  currentNight,
  findPlayer,
  holder,
  isAlive,
  kill,
  label,
  sortBySeat,
} from './helpers';
import type { ActionStep, CheckResult, Choice, GameState, NightRecord, NightStep, Player } from './types';
import { checkWinner } from './win';

/** Wake order (§7.1). The lover must be first. */
export const ACTION_STEPS: readonly ActionStep[] = ['lover', 'mafia', 'maniac', 'doctor', 'commissar'];

/** Alive players who act on this step. Step names equal role names. */
export function stepActors(state: GameState, step: NightStep): Player[] {
  return aliveWithRole(state, step === 'meeting' ? 'mafia' : step);
}

/** A fake wake: the role is absent or out of the game, the host only waits (§7.2). */
export function isStepFake(state: GameState, step: NightStep): boolean {
  if (step === 'meeting') return false;
  return stepActors(state, step).length === 0;
}

export function buildNightSteps(state: GameState, kind: 'meeting' | 'full'): NightStep[] {
  if (kind === 'meeting') return ['meeting'];
  const { settings, composition } = state;
  return ACTION_STEPS.filter((step) => {
    if (composition[step] === 0) return !settings.openSetup;
    return stepActors(state, step).length > 0 || settings.fakeWakes;
  });
}

export function startNight(state: GameState, number: number): void {
  const kind = number === 1 && state.settings.firstNight === 'meeting' ? 'meeting' : 'full';
  const record: NightRecord = {
    number,
    kind,
    steps: [],
    choices: {},
    resolved: false,
    blocked: null,
    checkResult: null,
    deaths: [],
    saved: [],
    alibiFor: null,
  };
  state.nights.push(record);
  record.steps = buildNightSteps(state, kind);
  state.alibi = null;
  state.pendingResult = null;
  state.phase = { t: 'night', number, stepIndex: 0 };
  if (record.steps.length === 0) resolveNight(state);
}

export function currentStep(state: GameState): NightStep {
  if (state.phase.t !== 'night') fail('phase.notNight', 'Сейчас не ночь');
  const step = currentNight(state).steps[state.phase.stepIndex];
  if (!step) fail('night.noStep', 'Ночь уже закончилась');
  return step;
}

/** The lover's client this night, if her visit counts. */
export function loverClient(state: GameState, night: NightRecord): string | null {
  const lover = holder(state, 'lover');
  const c = night.choices.lover;
  return lover?.alive && isAlive(state, c) ? c : null;
}

/** All actors of this step are blocked by the lover: their choice will not work. */
export function isStepBlocked(state: GameState, step: NightStep): boolean {
  if (step === 'meeting' || step === 'lover') return false;
  const client = loverClient(state, currentNight(state));
  if (!client) return false;
  const actors = stepActors(state, step);
  return actors.length > 0 && actors.every((a) => a.id === client);
}

/** Why `targetId` cannot be chosen on `step`, or null if it can (§7.3). */
export function targetError(state: GameState, step: ActionStep, targetId: string): string | null {
  const t = findPlayer(state, targetId);
  if (!t) return 'Такого игрока нет';
  if (!t.alive) return `${label(t)} выбыл из игры`;
  const s = state.settings;
  const m = state.memory;

  switch (step) {
    case 'lover':
      if (holder(state, 'lover')?.id === t.id) return 'Любовница не может выбрать себя';
      if (!s.loverRepeatTarget && m.lastLoverTarget === t.id) {
        return `Любовница была у ${label(t)} прошлой ночью`;
      }
      return null;
    case 'mafia':
      if (!s.mafiaCanTargetMafia && t.role === 'mafia') return 'Мафия не может выбрать своего';
      return null;
    case 'maniac':
      if (holder(state, 'maniac')?.id === t.id) return 'Маньяк не может выбрать себя';
      return null;
    case 'doctor': {
      if (holder(state, 'doctor')?.id === t.id) {
        const limit = s.doctorSelfHealLimit;
        if (limit !== null && m.doctorSelfHeals >= limit) {
          return limit === 0 ? 'Доктор не может лечить себя' : 'Доктор уже лечил себя';
        }
      }
      if (!s.doctorRepeatTarget && m.lastDoctorTarget === t.id) {
        return `Доктор лечил ${label(t)} прошлой ночью`;
      }
      return null;
    }
    case 'commissar':
      if (holder(state, 'commissar')?.id === t.id) return 'Комиссар не может проверить себя';
      return null;
  }
}

export function nightChoose(state: GameState, target: Choice): void {
  const step = currentStep(state);
  if (step === 'meeting') fail('night.meeting', 'В ночь знакомства выбор не делается');
  if (isStepFake(state, step)) fail('night.fake', 'Эта роль выбыла — только выдержите паузу');
  if (target !== null) {
    const err = targetError(state, step, target);
    if (err) fail('night.target', err);
  }
  currentNight(state).choices[step] = target;
}

export function nightProceed(state: GameState): void {
  const step = currentStep(state);
  const night = currentNight(state);
  if (step !== 'meeting' && !isStepFake(state, step) && night.choices[step] === undefined) {
    fail('night.noChoice', 'Сначала выберите цель или пропуск');
  }
  if (state.phase.t !== 'night') return;
  const next = state.phase.stepIndex + 1;
  if (next >= night.steps.length) {
    resolveNight(state);
  } else {
    state.phase = { ...state.phase, stepIndex: next };
  }
}

/** What the commissar sees this night (§4.4). */
export function commissarResult(state: GameState, night: NightRecord): CheckResult | null {
  const commissar = holder(state, 'commissar');
  const c = night.choices.commissar;
  if (!commissar?.alive || c === undefined || c === null) return null;
  if (loverClient(state, night) === commissar.id) return 'noAnswer';
  const t = findPlayer(state, c);
  if (!t) return null;
  if (t.role === 'mafia') return 'mafia';
  if (t.role === 'maniac') return state.settings.commissarManiacResult;
  return 'notMafia';
}

/** §7.4 — all night actions resolve at once. */
export function resolveNight(state: GameState): void {
  const night = currentNight(state);
  const s = state.settings;
  night.resolved = true;

  if (night.kind === 'full') {
    const c = night.choices;
    const actorWorks = (p: Player | undefined, client: string | null): p is Player =>
      !!p && p.alive && p.id !== client;

    // 1. Lover's block.
    const client = loverClient(state, night);

    // 2. Effective actions.
    const mafiaActors = aliveWithRole(state, 'mafia').filter((p) => p.id !== client);
    const mafiaTarget = mafiaActors.length > 0 && isAlive(state, c.mafia) ? c.mafia : null;
    const maniac = holder(state, 'maniac');
    const maniacTarget = actorWorks(maniac, client) && isAlive(state, c.maniac) ? c.maniac : null;
    const doctor = holder(state, 'doctor');
    const healed = actorWorks(doctor, client) && isAlive(state, c.doctor) ? c.doctor : null;
    night.checkResult = commissarResult(state, night);

    // 3. Protection.
    const protectedIds = new Set<string>();
    if (healed) protectedIds.add(healed);
    if (s.loverProtects && client) protectedIds.add(client);

    // 4. Deaths (one player cannot die twice).
    const attacked = [...new Set([mafiaTarget, maniacTarget].filter((x): x is string => !!x))];
    const deaths = new Map<string, 'night' | 'loverLink'>();
    for (const id of attacked) {
      if (protectedIds.has(id)) night.saved.push(id);
      else deaths.set(id, 'night');
    }

    // 5. Death link: the client dies with the lover.
    const lover = holder(state, 'lover');
    if (s.loverDeathLink && lover && deaths.has(lover.id) && client && !protectedIds.has(client) && !deaths.has(client)) {
      deaths.set(client, 'loverLink');
    }

    // 6. Alibi for the next day.
    night.blocked = client;
    night.alibiFor = s.loverAlibi && client && !deaths.has(client) ? client : null;
    state.alibi = night.alibiFor ? { day: night.number, playerId: night.alibiFor } : null;

    // 7. Memory: restrictions count by choice, not by result.
    state.memory.lastLoverTarget = c.lover ?? null;
    state.memory.lastDoctorTarget = c.doctor ?? null;
    if (doctor && c.doctor === doctor.id) state.memory.doctorSelfHeals += 1;

    // 8. Everyone dies at once; announced by seat, without killers.
    for (const [id, cause] of deaths) kill(state, id, cause, 'night', night.number);
    night.deaths = sortBySeat(state, [...deaths.keys()]).map((id) => ({
      playerId: id,
      cause: deaths.get(id) ?? 'night',
    }));
    night.saved = sortBySeat(state, night.saved);
  }

  // 9. Win check — announced after the morning report.
  state.pendingResult = checkWinner(state.players, s.earlyWinDetection);
  state.phase = { t: 'morning', number: night.number };
}
