// Event-sourced game engine (GAME_DESIGN.md §13).
// The state is always `events.reduce(apply)`; undo = drop the last event and replay.

import {
  afterDayRemoval,
  castVotes,
  chooseFirstSpeaker,
  defenseProceed,
  discussionProceed,
  lastWordsProceed,
  morningProceed,
  nominate,
  verdictProceed,
} from './day';
import { type EngineError, type Result, RuleError, fail } from './errors';
import { getPlayer, label } from './helpers';
import { nightChoose, nightProceed, startNight } from './night';
import { MAX_PLAYERS, MAX_SEAT, MIN_PLAYERS, ROLES, validateComposition } from './roles';
import { shuffle } from './rng';
import { withDefaults } from './settings';
import type { CreateGameEvent, GameEvent, GameState, Player, Role } from './types';
import { checkWinner } from './win';

export interface Game {
  events: GameEvent[];
  state: GameState;
}

// ---------- Creating a game ----------

function createState(e: CreateGameEvent): GameState {
  const settings = withDefaults(e.settings);
  const n = e.players.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) {
    fail('players.range', `Игроков должно быть от ${MIN_PLAYERS} до ${MAX_PLAYERS}`, { min: MIN_PLAYERS, max: MAX_PLAYERS });
  }
  const ids = new Set(e.players.map((p) => p.id));
  if (ids.size !== n || e.players.some((p) => !p.id)) fail('players.ids', 'У игроков должны быть разные id');

  // Players stay in the given (seating) order. Seat numbers are labels from the table cards:
  // either given for everyone (1–20, unique) or 1..N in the given order.
  const given = e.players.map((p) => p.seat);
  let seats: number[];
  if (given.every((s) => s === undefined)) {
    seats = e.players.map((_, i) => i + 1);
  } else {
    if (given.some((s) => s === undefined)) fail('players.seats', 'Укажите номер каждого игрока');
    seats = given as number[];
    if (seats.some((s) => !Number.isInteger(s) || s < 1 || s > MAX_SEAT)) {
      fail('players.seatRange', `Номера мест — от 1 до ${MAX_SEAT}`, { max: MAX_SEAT });
    }
    const dup = seats.find((s, i) => seats.indexOf(s) !== i);
    if (dup !== undefined) fail('players.seatDup', `Номер ${dup} занят дважды`, { seat: dup });
  }

  const check = validateComposition(n, e.composition);
  const firstError = check.errors[0];
  if (firstError) fail(firstError.code, firstError.message, firstError.params);

  const pool: Role[] = ROLES.flatMap((r) => Array<Role>(e.composition[r]).fill(r));
  let roles: Role[];
  if (e.dealing === 'app') {
    if (!e.seed) fail('deal.seed', 'Для раздачи нужно зерно');
    roles = shuffle(pool, e.seed);
  } else {
    if (!e.roles || e.roles.length !== n) fail('deal.roles', 'Укажите роль каждого игрока');
    const given = [...e.roles].sort().join();
    if (given !== [...pool].sort().join()) {
      fail('deal.mismatch', 'Розданные роли не совпадают с составом');
    }
    roles = e.roles;
  }

  const players: Player[] = e.players.map((p, i) => ({
    id: p.id,
    seat: seats[i] as number,
    name: p.name.trim() || `Игрок ${seats[i]}`,
    role: roles[i] as Role,
    alive: true,
    death: null,
    fouls: 0,
    skipNextSpeech: false,
  }));

  const state: GameState = {
    version: 1,
    settings,
    composition: { ...e.composition },
    dealing: e.dealing,
    seed: e.seed ?? null,
    players,
    phase: { t: 'reveal', index: 0 },
    nights: [],
    days: [],
    memory: { lastLoverTarget: null, lastDoctorTarget: null, doctorSelfHeals: 0 },
    alibi: null,
    pendingResult: null,
  };
  if (e.dealing === 'cards') startNight(state, 1);
  return state;
}

// ---------- Applying events ----------

/** Applies one event to a copy of the state. Throws RuleError on an invalid event. */
export function applyEvent(prev: GameState | null, event: GameEvent): GameState {
  if (event.type === 'CreateGame') {
    if (prev) fail('game.exists', 'Игра уже создана');
    return createState(event);
  }
  if (!prev) fail('game.none', 'Игра ещё не создана');
  const state = structuredClone(prev);
  const ph = state.phase;

  if (ph.t === 'gameOver') fail('game.over', 'Игра окончена');

  switch (event.type) {
    case 'Proceed':
      proceed(state);
      break;
    case 'NightChoose':
      nightChoose(state, event.target);
      break;
    case 'Nominate':
      nominate(state, event.candidate);
      break;
    case 'CastVotes':
      castVotes(state, event);
      break;
    case 'RemovePlayer':
      removePlayer(state, event.playerId, event.cause);
      break;
    case 'Foul':
      foul(state, event.playerId);
      break;
    case 'ChangeSeat':
      changeSeat(state, event.playerId, event.seat);
      break;
    case 'RenamePlayer':
      renamePlayer(state, event.playerId, event.name);
      break;
    case 'ChooseFirstSpeaker':
      chooseFirstSpeaker(state, event.playerId);
      break;
    case 'EndGame':
      state.phase = {
        t: 'gameOver',
        result: { winner: event.result === 'draw' ? 'draw' : 'aborted', reason: 'manual' },
      };
      break;
    default: {
      const never: never = event;
      fail('event.unknown', `Неизвестное событие ${(never as GameEvent).type}`, { type: (never as GameEvent).type });
    }
  }
  return state;
}

function proceed(state: GameState): void {
  const ph = state.phase;
  switch (ph.t) {
    case 'reveal':
      if (ph.index + 1 >= state.players.length) startNight(state, 1);
      else state.phase = { t: 'reveal', index: ph.index + 1 };
      return;
    case 'night':
      return nightProceed(state);
    case 'morning':
      return morningProceed(state);
    case 'lastWords':
      return lastWordsProceed(state);
    case 'discussion':
      return discussionProceed(state);
    case 'defense':
      return defenseProceed(state);
    case 'verdict':
      return verdictProceed(state);
    case 'voting':
      fail('vote.pending', 'Сначала внесите голоса');
    case 'gameOver':
      fail('game.over', 'Игра окончена');
  }
}

// ---------- Removal and fouls (§11.1, §11.2) ----------

function removePlayer(state: GameState, id: string, cause: 'removed' | 'left'): void {
  const ph = state.phase;
  if (ph.t === 'reveal') fail('remove.reveal', 'Дождитесь окончания раздачи ролей');
  const p = getPlayer(state, id);
  if (!p.alive) fail('remove.dead', `${label(p)} уже выбыл`, { seat: p.seat });

  const isNight = ph.t === 'night';
  const number = 'number' in ph ? ph.number : 0;
  p.alive = false;
  p.death = { cause, phase: isNight ? 'night' : 'day', number };

  const result = checkWinner(state.players, state.settings.earlyWinDetection);
  if (result) {
    state.phase = { t: 'gameOver', result };
    return;
  }
  if (ph.t === 'morning' || ph.t === 'verdict') state.pendingResult = null;
  // At night the removed player's choice is ignored at resolution (they are no longer alive).
  if (!isNight) afterDayRemoval(state);
}

function foul(state: GameState, id: string): void {
  if (!state.settings.fouls) fail('foul.off', 'Фолы выключены в настройках');
  if (state.phase.t === 'reveal') fail('foul.reveal', 'Дождитесь окончания раздачи ролей');
  const p = getPlayer(state, id);
  if (!p.alive) fail('foul.dead', `${label(p)} уже выбыл`, { seat: p.seat });
  p.fouls += 1;
  if (p.fouls === 3) p.skipNextSpeech = true;
  if (p.fouls >= 4) removePlayer(state, id, 'removed');
}

// ---------- Host's console: labels only, no effect on the rules ----------

export const MAX_NAME_LENGTH = 20;

function changeSeat(state: GameState, id: string, seat: number): void {
  const p = getPlayer(state, id);
  if (!Number.isInteger(seat) || seat < 1 || seat > MAX_SEAT) fail('seat.range', `Номера мест — от 1 до ${MAX_SEAT}`, { max: MAX_SEAT });
  const holder = state.players.find((x) => x.seat === seat && x.id !== id);
  if (holder) fail('seat.taken', `Номер ${seat} уже у игрока ${holder.name}`, { seat, name: holder.name });
  p.seat = seat;
}

function renamePlayer(state: GameState, id: string, name: string): void {
  const p = getPlayer(state, id);
  const clean = name.trim().replace(/\s+/g, ' ');
  if (clean.length > MAX_NAME_LENGTH) fail('name.long', `Имя — не длиннее ${MAX_NAME_LENGTH} символов`, { max: MAX_NAME_LENGTH });
  const next = clean || `Игрок ${p.seat}`;
  const key = next.toLocaleLowerCase('ru-RU');
  const same = state.players.find((x) => x.id !== id && x.name.toLocaleLowerCase('ru-RU') === key);
  if (same) fail('name.taken', `Имя «${same.name}» уже у №${same.seat}`, { name: same.name, seat: same.seat });
  p.name = next;
}

// ---------- Public API ----------

function toError(err: unknown): EngineError {
  if (err instanceof RuleError) {
    return err.params ? { code: err.code, message: err.message, params: err.params } : { code: err.code, message: err.message };
  }
  throw err;
}

export function newGame(event: CreateGameEvent): Result<Game> {
  try {
    return { ok: true, value: { events: [event], state: applyEvent(null, event) } };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

/** Applies an event. On a rule violation the game is unchanged and the error explains why. */
export function dispatch(game: Game, event: GameEvent): Result<Game> {
  try {
    const state = applyEvent(game.state, event);
    return { ok: true, value: { events: [...game.events, event], state } };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

/** Rebuilds the game from its event log. */
export function replay(events: GameEvent[]): Result<Game> {
  try {
    let state: GameState | null = null;
    for (const e of events) state = applyEvent(state, e);
    if (!state) fail('game.none', 'Журнал пуст');
    return { ok: true, value: { events: [...events], state } };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

/**
 * Rebuilds as much of a saved game as possible: applies events until the first one that no longer
 * passes the rules (e.g. a log saved by an older version) and drops it and everything after it.
 * `game` is null only when the creation event itself is invalid.
 */
export function replayTolerant(events: GameEvent[]): { game: Game | null; dropped: number; error: EngineError | null } {
  let state: GameState | null = null;
  for (let i = 0; i < events.length; i++) {
    const e = events[i] as GameEvent;
    try {
      state = applyEvent(state, e);
    } catch (err) {
      const error = toError(err);
      const game = state ? { events: events.slice(0, i), state } : null;
      return { game, dropped: events.length - i, error };
    }
  }
  return { game: state ? { events: [...events], state } : null, dropped: 0, error: null };
}

/** Undo the last action. Game creation itself cannot be undone. */
export function undo(game: Game): Game {
  if (game.events.length <= 1) return game;
  const r = replay(game.events.slice(0, -1));
  if (!r.ok) throw new Error(`Журнал повреждён: ${r.error.message}`);
  return r.value;
}

export function canUndo(game: Game): boolean {
  return game.events.length > 1;
}
