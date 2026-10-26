// Day phase: last words, speeches, nominations, voting, ties, verdict (GAME_DESIGN.md §8).

import { fail } from './errors';
import {
  alivePlayers,
  currentDay,
  currentNight,
  findPlayer,
  isAlive,
  kill,
  label,
  labelOf,
  nextAliveAfter,
  sortBySeat,
} from './helpers';
import { startNight } from './night';
import type { DayRecord, GameState, Player, VerdictReason, VoteRound } from './types';
import { checkWinner } from './win';

// ---------- Morning and last words ----------

export function morningProceed(state: GameState): void {
  if (state.phase.t !== 'morning') return;
  const number = state.phase.number;
  if (state.pendingResult) {
    state.phase = { t: 'gameOver', result: state.pendingResult };
    return;
  }
  const deaths = currentNight(state).deaths.map((d) => d.playerId);
  if (state.settings.lastWordNight && deaths.length > 0) {
    state.phase = { t: 'lastWords', number, queue: sortBySeat(state, deaths), then: 'discussion' };
  } else {
    startDay(state, number);
  }
}

export function lastWordsProceed(state: GameState): void {
  if (state.phase.t !== 'lastWords') return;
  const [, ...rest] = state.phase.queue;
  if (rest.length > 0) {
    state.phase = { ...state.phase, queue: rest };
  } else if (state.phase.then === 'discussion') {
    startDay(state, state.phase.number);
  } else {
    startNight(state, state.phase.number + 1);
  }
}

// ---------- Discussion ----------

/** §8.2 */
export function firstSpeakerFor(state: GameState): Player {
  const prev = state.days[state.days.length - 1];
  let first: Player | undefined;
  if (prev && state.settings.speakingOrder === 'rotating') {
    const prevSeat = findPlayer(state, prev.firstSpeaker)?.seat ?? 0;
    first = nextAliveAfter(state, prevSeat);
  } else {
    // Seat 1 if alive, otherwise the next alive one.
    first = nextAliveAfter(state, state.players.length);
  }
  if (!first) fail('day.noPlayers', 'Не осталось живых игроков');
  return first;
}

export function startDay(state: GameState, number: number): void {
  const first = firstSpeakerFor(state);
  const order: string[] = [];
  let p: Player | undefined = first;
  while (p && !order.includes(p.id)) {
    order.push(p.id);
    p = nextAliveAfter(state, p.seat);
  }
  const day: DayRecord = {
    number,
    firstSpeaker: first.id,
    order,
    nominations: [],
    rounds: [],
    eliminated: [],
    verdict: null,
    voteCancelled: false,
  };
  state.days.push(day);
  state.pendingResult = null;
  state.phase = { t: 'discussion', number, index: 0 };
  settleSpeaker(state);
}

/** Skip players who are out or must skip this speech (3rd foul); end the discussion after the last one. */
function settleSpeaker(state: GameState): void {
  if (state.phase.t !== 'discussion') return;
  const day = currentDay(state);
  let index = state.phase.index;
  while (index < day.order.length) {
    const p = findPlayer(state, day.order[index] ?? '');
    if (p?.alive && !p.skipNextSpeech) break;
    if (p?.alive && p.skipNextSpeech) p.skipNextSpeech = false;
    index++;
  }
  if (index >= day.order.length) {
    concludeDiscussion(state);
  } else {
    state.phase = { ...state.phase, index };
  }
}

export function currentSpeaker(state: GameState): Player | null {
  if (state.phase.t !== 'discussion') return null;
  const id = currentDay(state).order[state.phase.index];
  return id ? (findPlayer(state, id) ?? null) : null;
}

export function hasAlibi(state: GameState, id: string): boolean {
  return state.alibi !== null && state.alibi.playerId === id && state.alibi.day === dayNumber(state);
}

function dayNumber(state: GameState): number {
  const ph = state.phase;
  return 'number' in ph ? ph.number : 0;
}

/** Why `candidate` cannot be nominated by the current speaker, or null (§8.3). */
export function nominationError(state: GameState, candidate: string): string | null {
  const speaker = currentSpeaker(state);
  if (!speaker) return 'Сейчас нельзя выставлять';
  const day = currentDay(state);
  if (day.nominations.some((n) => n.by === speaker.id)) {
    return `${label(speaker)} уже выставил кандидата`;
  }
  const c = findPlayer(state, candidate);
  if (!c) return 'Такого игрока нет';
  if (!c.alive) return `${label(c)} выбыл из игры`;
  if (c.id === speaker.id && !state.settings.selfNomination) return 'Нельзя выставить себя';
  if (hasAlibi(state, c.id)) return `У ${label(c)} алиби`;
  if (day.nominations.some((n) => n.candidate === c.id)) return `${label(c)} уже выставлен`;
  return null;
}

export function nominate(state: GameState, candidate: string): void {
  const err = nominationError(state, candidate);
  if (err) fail('day.nominate', err);
  const speaker = currentSpeaker(state) as Player;
  currentDay(state).nominations.push({ by: speaker.id, candidate });
}

export function discussionProceed(state: GameState): void {
  if (state.phase.t !== 'discussion') return;
  state.phase = { ...state.phase, index: state.phase.index + 1 };
  settleSpeaker(state);
}

/** After the last speech: decide whether there is a vote (§8.4). */
export function concludeDiscussion(state: GameState): void {
  const day = currentDay(state);
  const s = state.settings;
  const candidates = day.nominations.map((n) => n.candidate).filter((id) => isAlive(state, id));

  day.voteCancelled = s.removalCancelsVote && removedToday(state, day.number);
  if (day.voteCancelled) return verdict(state, [], 'removalCancelled');
  if (candidates.length === 0) return verdict(state, [], 'noCandidates');
  if (day.number === 1 && !s.firstDayVoting) return verdict(state, [], 'firstDayNoVoting');
  if (candidates.length === 1) {
    if (day.number === 1 && s.firstDaySingleCandidateSafe) return verdict(state, [], 'firstDaySingle');
    if (day.number > 1 && s.singleCandidateAutoEliminate) {
      return verdict(state, candidates, 'autoSingle');
    }
  }
  state.phase = { t: 'voting', number: day.number, kind: 'main', candidates };
}

// ---------- Voting ----------

/** §8.5 — alive players; the alibi client only if allowed. */
export function eligibleVoters(state: GameState): Player[] {
  return alivePlayers(state).filter((p) => state.settings.alibiClientCanVote || !hasAlibi(state, p.id));
}

export function castVotes(
  state: GameState,
  input: { voters?: Record<string, string[]>; counts?: Record<string, number> },
): void {
  if (state.phase.t !== 'voting') fail('phase.notVoting', 'Сейчас не голосование');
  const { kind, candidates, number } = state.phase;
  const keys = kind === 'allOut' ? ['yes'] : candidates;
  const eligible = eligibleVoters(state);
  const eligibleIds = new Set(eligible.map((p) => p.id));

  if ((input.voters === undefined) === (input.counts === undefined)) {
    fail('vote.input', 'Передайте либо список голосовавших, либо количество голосов');
  }

  const counts: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  let voters: Record<string, string[]> | null = null;

  if (input.voters) {
    voters = Object.fromEntries(keys.map((k) => [k, [] as string[]]));
    const seen = new Set<string>();
    for (const [key, ids] of Object.entries(input.voters)) {
      if (!keys.includes(key)) fail('vote.candidate', `${labelOf(state, key)} не кандидат`);
      for (const id of ids) {
        if (!eligibleIds.has(id)) fail('vote.voter', `${labelOf(state, id)} не может голосовать`);
        if (seen.has(id)) fail('vote.twice', `${labelOf(state, id)} уже проголосовал`);
        seen.add(id);
        (voters[key] as string[]).push(id);
      }
      counts[key] = (voters[key] as string[]).length;
    }
  } else {
    let sum = 0;
    for (const [key, n] of Object.entries(input.counts ?? {})) {
      if (!keys.includes(key)) fail('vote.candidate', `${labelOf(state, key)} не кандидат`);
      if (!Number.isInteger(n) || n < 0) fail('vote.count', 'Число голосов должно быть целым и неотрицательным');
      counts[key] = n;
      sum += n;
    }
    if (sum > eligible.length) {
      fail('vote.tooMany', `Голосов ${sum}, а голосующих только ${eligible.length}`);
    }
  }

  // Abstaining not allowed: silent players vote for the last candidate.
  let forced = 0;
  if (kind !== 'allOut' && !state.settings.abstainAllowed) {
    const total = keys.reduce((sum, k) => sum + (counts[k] ?? 0), 0);
    forced = eligible.length - total;
    const last = keys[keys.length - 1] as string;
    counts[last] = (counts[last] ?? 0) + forced;
  }

  const round: VoteRound = { kind, candidates, voters, counts, forced, eligible: eligible.length };
  currentDay(state).rounds.push(round);
  decideRound(state, round, number);
}

/** §8.6 */
function decideRound(state: GameState, round: VoteRound, number: number): void {
  if (round.kind === 'allOut') {
    const yes = round.counts.yes ?? 0;
    if (yes * 2 > round.eligible) return verdict(state, round.candidates, 'allOut');
    return verdict(state, [], 'allOutFailed');
  }

  const max = Math.max(...round.candidates.map((c) => round.counts[c] ?? 0));
  if (max <= 0) return verdict(state, [], 'noVotes');
  const leaders = round.candidates.filter((c) => (round.counts[c] ?? 0) === max);
  if (leaders.length === 1) return verdict(state, leaders, 'eliminated');

  const rule = state.settings.tieRule;
  if (rule === 'nobody') return verdict(state, [], 'tieNobody');
  if (round.kind === 'main') {
    state.phase = { t: 'defense', number, queue: leaders, candidates: leaders };
    return;
  }
  // Tie again after a revote.
  if (rule === 'revoteThenNobody') return verdict(state, [], 'tieNobody');
  if (leaders.length === round.candidates.length) {
    state.phase = { t: 'voting', number, kind: 'allOut', candidates: leaders };
  } else {
    state.phase = { t: 'defense', number, queue: leaders, candidates: leaders };
  }
}

export function defenseProceed(state: GameState): void {
  if (state.phase.t !== 'defense') return;
  const [, ...rest] = state.phase.queue;
  if (rest.length > 0) {
    state.phase = { ...state.phase, queue: rest };
  } else {
    state.phase = { t: 'voting', number: state.phase.number, kind: 'revote', candidates: state.phase.candidates };
  }
}

// ---------- Verdict ----------

export function verdict(state: GameState, eliminated: string[], reason: VerdictReason): void {
  const day = currentDay(state);
  const out = sortBySeat(state, eliminated);
  for (const id of out) kill(state, id, 'vote', 'day', day.number);
  day.eliminated.push(...out);
  day.verdict = reason;
  state.pendingResult = checkWinner(state.players, state.settings.earlyWinDetection);
  state.phase = { t: 'verdict', number: day.number, eliminated: out, reason };
}

export function verdictProceed(state: GameState): void {
  if (state.phase.t !== 'verdict') return;
  const { number, eliminated } = state.phase;
  if (state.pendingResult) {
    state.phase = { t: 'gameOver', result: state.pendingResult };
    return;
  }
  if (state.settings.lastWordDay && eliminated.length > 0) {
    state.phase = { t: 'lastWords', number, queue: eliminated, then: 'night' };
  } else {
    startNight(state, number + 1);
  }
}

// ---------- Removal during the day (§11.1) ----------

export function afterDayRemoval(state: GameState): void {
  const ph = state.phase;
  if (ph.t === 'discussion') {
    settleSpeaker(state);
  } else if (ph.t === 'voting' || ph.t === 'defense') {
    // Restart the vote from the main round with the remaining candidates
    // (or cancel it, if `removalCancelsVote`).
    concludeDiscussion(state);
  }
}

/** A player was removed or left during this day (morning included). */
function removedToday(state: GameState, day: number): boolean {
  return state.players.some(
    (p) =>
      p.death !== null &&
      (p.death.cause === 'removed' || p.death.cause === 'left') &&
      p.death.phase === 'day' &&
      p.death.number === day,
  );
}
