import { getEligibleVoters, type GameState } from '@greenmafia/engine';

export interface TimerDraft {
  totalMs: number;
  remainingMs: number;
  running: boolean;
  deadline: number | null;
}

export interface VotingDraft {
  votes: Record<string, string[]>;
  counts: Record<string, number>;
  page: number;
  quick: boolean;
  yes: string[];
  count: number;
}

export interface GameRuntime {
  version: 1;
  phaseKey: string;
  paused: boolean;
  timer: TimerDraft | null;
  voting: VotingDraft | null;
}

/** Stable while a nomination/name changes; different for every speaker and vote round. */
export function phaseKey(s: GameState): string {
  const p = s.phase;
  const round = s.days.at(-1)?.rounds.length ?? 0;
  switch (p.t) {
    case 'discussion': return `${p.t}:${p.number}:${p.index}`;
    case 'lastWords': return `${p.t}:${p.number}:${p.then}:${p.queue[0]}`;
    case 'defense': return `${p.t}:${p.number}:${round}:${p.queue[0]}`;
    case 'voting': return `${p.t}:${p.number}:${round}:${p.kind}:${p.candidates.join(',')}`;
    case 'night': return `${p.t}:${p.number}:${p.stepIndex}`;
    case 'reveal': return `${p.t}:${p.index}`;
    case 'gameOver': return p.t;
    default: return `${p.t}:${p.number}`;
  }
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function timerRemaining(timer: TimerDraft, now = Date.now()): number {
  return Math.max(0, Math.min(timer.totalMs, timer.running && timer.deadline !== null ? timer.deadline - now : timer.remainingMs));
}

/** Validate optional UI data separately from the authoritative game event log. */
export function runtimeFor(s: GameState, saved?: unknown, restore = false, now = Date.now()): GameRuntime {
  const key = phaseKey(s);
  const source = record(saved) && saved.version === 1 && saved.phaseKey === key ? saved : null;
  const p = s.phase;
  const duration = p.t === 'discussion' ? s.settings.timers.speech : p.t === 'defense' ? s.settings.timers.defense : p.t === 'lastWords' ? s.settings.timers.lastWord : null;
  let timer: TimerDraft | null = duration === null ? null : { totalMs: duration * 1000, remainingMs: duration * 1000, running: false, deadline: null };
  if (timer && source && record(source.timer)) {
    const candidate = source.timer;
    if (candidate.totalMs === timer.totalMs && finite(candidate.remainingMs) && candidate.remainingMs >= 0 && candidate.remainingMs <= timer.totalMs
      && typeof candidate.running === 'boolean' && (candidate.deadline === null || finite(candidate.deadline))) {
      timer = { totalMs: timer.totalMs, remainingMs: candidate.remainingMs, running: candidate.running, deadline: candidate.deadline as number | null };
    }
  }
  // Restoring never silently starts a clock or emits a time-up signal.
  if (timer && restore) timer = { ...timer, remainingMs: timerRemaining(timer, now), deadline: null };
  let voting: VotingDraft | null = null;
  if (p.t === 'voting') {
    const candidates = p.kind === 'allOut' ? ['yes'] : p.candidates;
    const eligible = new Set(getEligibleVoters(s).map((v) => v.id));
    const draft = source && record(source.voting) ? source.voting : {};
    const oldVotes = record(draft.votes) ? draft.votes : {};
    const oldCounts = record(draft.counts) ? draft.counts : {};
    const assigned = new Set<string>();
    const votes: Record<string, string[]> = {};
    const counts: Record<string, number> = {};
    let countBudget = eligible.size;
    const validIds = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string' && eligible.has(v)))] : [];
    for (const id of candidates) {
      votes[id] = validIds(oldVotes[id]).filter((v) => { if (assigned.has(v)) return false; assigned.add(v); return true; });
      const n = oldCounts[id];
      counts[id] = finite(n) ? Math.min(countBudget, Math.max(0, Math.floor(n))) : 0;
      countBudget -= counts[id];
    }
    voting = {
      votes, counts,
      page: finite(draft.page) ? Math.min(p.candidates.length, Math.max(0, Math.floor(draft.page))) : 0,
      quick: draft.quick === true,
      yes: validIds(draft.yes),
      count: finite(draft.count) ? Math.min(eligible.size, Math.max(0, Math.floor(draft.count))) : 0,
    };
  }
  return { version: 1, phaseKey: key, paused: restore || source?.paused === true, timer, voting };
}

export function pauseRuntime(runtime: GameRuntime, paused: boolean, now = Date.now()): GameRuntime {
  const timer = runtime.timer;
  if (!timer) return { ...runtime, paused };
  const remainingMs = timerRemaining(timer, now);
  return { ...runtime, paused, timer: { ...timer, remainingMs, deadline: timer.running && !paused ? now + remainingMs : null } };
}
