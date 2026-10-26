// Core data model of the game. See GAME_DESIGN.md §13.

import type { Settings } from './settings';

export type Role = 'civilian' | 'mafia' | 'commissar' | 'doctor' | 'lover' | 'maniac';
export type Team = 'town' | 'mafia' | 'maniac';

/** Number of players per role. */
export type Composition = Record<Role, number>;

export type DeathCause = 'night' | 'loverLink' | 'vote' | 'removed' | 'left';

export interface Death {
  cause: DeathCause;
  phase: 'night' | 'day';
  /** Night or day number when the player left the game. */
  number: number;
}

export interface Player {
  id: string;
  /** 1..N, clockwise. Never changes. */
  seat: number;
  name: string;
  role: Role;
  alive: boolean;
  death: Death | null;
  fouls: number;
  /** Set by the 3rd foul: the player's next speech is skipped. */
  skipNextSpeech: boolean;
}

export type ActionStep = 'lover' | 'mafia' | 'maniac' | 'doctor' | 'commissar';
export type NightStep = 'meeting' | ActionStep;

export type CheckResult = 'mafia' | 'notMafia' | 'noAnswer';

/**
 * A choice is a player id, `null` for "skip / miss",
 * or absent (undefined) when the step has not been answered.
 */
export type Choice = string | null;

export interface NightRecord {
  number: number;
  kind: 'meeting' | 'full';
  steps: NightStep[];
  choices: Partial<Record<ActionStep, Choice>>;
  resolved: boolean;
  /** The lover's client whose night action was blocked. */
  blocked: string | null;
  checkResult: CheckResult | null;
  /** Sorted by seat. */
  deaths: { playerId: string; cause: DeathCause }[];
  /** Attacked but survived (healed or protected). For the chronicle. */
  saved: string[];
  alibiFor: string | null;
}

export type VoteKind = 'main' | 'revote' | 'allOut';

export interface VoteRound {
  kind: VoteKind;
  candidates: string[];
  /** Who voted for whom (null when the host entered plain numbers). For `allOut` the key is `yes`. */
  voters: Record<string, string[]> | null;
  /** Final counts including forced votes. For `allOut` the key is `yes`. */
  counts: Record<string, number>;
  /** Votes assigned to the last candidate because abstaining is not allowed. */
  forced: number;
  /** Number of players who had the right to vote. */
  eligible: number;
}

export type VerdictReason =
  | 'eliminated'
  | 'allOut'
  | 'autoSingle'
  | 'noCandidates'
  | 'firstDayNoVoting'
  | 'firstDaySingle'
  | 'noVotes'
  | 'tieNobody'
  | 'allOutFailed'
  | 'removalCancelled';

export interface DayRecord {
  number: number;
  firstSpeaker: string;
  /** Speaking order: alive players at the start of the day, starting from firstSpeaker. */
  order: string[];
  nominations: { by: string; candidate: string }[];
  rounds: VoteRound[];
  eliminated: string[];
  verdict: VerdictReason | null;
  /** A player was removed during the day and `removalCancelsVote` is on. */
  voteCancelled: boolean;
}

export interface Memory {
  lastLoverTarget: Choice;
  lastDoctorTarget: Choice;
  doctorSelfHeals: number;
}

export type Winner = 'town' | 'mafia' | 'maniac' | 'draw' | 'aborted';

export type ResultReason =
  | 'allEvilDead'
  | 'maniacLast'
  | 'parity'
  | 'mafiaMajority'
  | 'allDead'
  | 'stalemate'
  | 'manual';

export interface GameResult {
  winner: Winner;
  reason: ResultReason;
}

export type Phase =
  | { t: 'reveal'; index: number }
  | { t: 'night'; number: number; stepIndex: number }
  | { t: 'morning'; number: number }
  | { t: 'lastWords'; number: number; queue: string[]; then: 'discussion' | 'night' }
  | { t: 'discussion'; number: number; index: number }
  | { t: 'voting'; number: number; kind: VoteKind; candidates: string[] }
  | { t: 'defense'; number: number; queue: string[]; candidates: string[] }
  | { t: 'verdict'; number: number; eliminated: string[]; reason: VerdictReason }
  | { t: 'gameOver'; result: GameResult };

export interface GameState {
  version: 1;
  settings: Settings;
  composition: Composition;
  dealing: 'app' | 'cards';
  seed: string | null;
  /** Sorted by seat. */
  players: Player[];
  phase: Phase;
  nights: NightRecord[];
  days: DayRecord[];
  memory: Memory;
  /** Lover's alibi, valid only during the given day. */
  alibi: { day: number; playerId: string } | null;
  /** Win detected but not announced yet (morning / verdict screens). */
  pendingResult: GameResult | null;
}

// ---------- Events ----------

export interface CreateGameEvent {
  type: 'CreateGame';
  settings: Settings;
  /** In seat order. */
  players: { id: string; name: string }[];
  composition: Composition;
  /** `app` — the app deals with `seed`; `cards` — the host enters `roles` (by seat). */
  dealing: 'app' | 'cards';
  seed?: string;
  roles?: Role[];
}

export type GameEvent =
  | CreateGameEvent
  /** "Next": role seen, night step done, speech over, announcement read, etc. */
  | { type: 'Proceed' }
  | { type: 'NightChoose'; target: Choice }
  | { type: 'Nominate'; candidate: string }
  | { type: 'CastVotes'; voters?: Record<string, string[]>; counts?: Record<string, number> }
  | { type: 'RemovePlayer'; playerId: string; cause: 'removed' | 'left' }
  | { type: 'Foul'; playerId: string }
  | { type: 'EndGame'; result: 'draw' | 'aborted' };
