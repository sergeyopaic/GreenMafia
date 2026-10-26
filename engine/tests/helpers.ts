import { expect } from 'vitest';
import {
  CLASSIC_SETTINGS,
  type ActionStep,
  type Game,
  type GameEvent,
  type Role,
  type Settings,
  dispatch,
  emptyComposition,
  getCurrentSpeaker,
  getNightStepView,
  newGame,
} from '../src';

/** Player id by seat. */
export const id = (seat: number) => `p${seat}`;

/**
 * Seats: 1–2 mafia, 3 commissar, 4 doctor, 5 lover, 6 maniac, 7–10 civilians.
 */
export const BASE: Role[] = [
  'mafia',
  'mafia',
  'commissar',
  'doctor',
  'lover',
  'maniac',
  'civilian',
  'civilian',
  'civilian',
  'civilian',
];

/** Same as BASE without the maniac and one civilian: 9 players, all alive on day 1. Seats 1–2 mafia, 3 commissar, 4 doctor, 5 lover, 6–9 civilians. */
export const NINE: Role[] = ['mafia', 'mafia', 'commissar', 'doctor', 'lover', 'civilian', 'civilian', 'civilian', 'civilian'];

export function setup(roles: Role[], settings: Partial<Settings> = {}): Game {
  const composition = emptyComposition();
  for (const r of roles) composition[r]++;
  const r = newGame({
    type: 'CreateGame',
    settings: { ...CLASSIC_SETTINGS, ...settings },
    players: roles.map((_, i) => ({ id: id(i + 1), name: `Игрок ${i + 1}` })),
    composition,
    dealing: 'cards',
    roles,
  });
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

export function act(game: Game, event: GameEvent): Game {
  const r = dispatch(game, event);
  if (!r.ok) throw new Error(`${event.type}: ${r.error.message}`);
  return r.value;
}

export function expectError(game: Game, event: GameEvent, code?: string): string {
  const r = dispatch(game, event);
  expect(r.ok, `ожидалась ошибка для ${event.type}`).toBe(false);
  if (r.ok) return '';
  if (code) expect(r.error.code).toBe(code);
  return r.error.message;
}

export const proceed = (g: Game) => act(g, { type: 'Proceed' });

/** Plays the current night. Choices are seats; missing = skip. Stops in the morning. */
export function night(game: Game, choices: Partial<Record<ActionStep, number | null>> = {}): Game {
  let g = game;
  while (g.state.phase.t === 'night') {
    const view = getNightStepView(g.state);
    if (!view) break;
    if (view.step !== 'meeting' && !view.fake) {
      const seat = choices[view.step];
      g = act(g, { type: 'NightChoose', target: seat == null ? null : id(seat) });
    }
    g = proceed(g);
  }
  return g;
}

/** Morning → last words → discussion. */
export function toDiscussion(game: Game): Game {
  let g = game;
  while (g.state.phase.t === 'morning' || g.state.phase.t === 'lastWords') g = proceed(g);
  return g;
}

/** Runs speeches. `noms` maps speaker seat → candidate seat. Stops at voting / verdict. */
export function discuss(game: Game, noms: Record<number, number> = {}): Game {
  let g = toDiscussion(game);
  while (g.state.phase.t === 'discussion') {
    const speaker = getCurrentSpeaker(g.state);
    const cand = speaker ? noms[speaker.seat] : undefined;
    if (cand !== undefined) g = act(g, { type: 'Nominate', candidate: id(cand) });
    g = proceed(g);
  }
  return g;
}

/** `votes` maps candidate seat (or 'yes') → voter seats. */
export function vote(game: Game, votes: Record<string, number[]>): Game {
  const voters: Record<string, string[]> = {};
  for (const [k, seats] of Object.entries(votes)) {
    voters[k === 'yes' ? 'yes' : id(Number(k))] = seats.map(id);
  }
  return act(game, { type: 'CastVotes', voters });
}

export function defend(game: Game): Game {
  let g = game;
  while (g.state.phase.t === 'defense') g = proceed(g);
  return g;
}

/** From the morning / discussion to the next night without nominations. */
export function skipDay(game: Game): Game {
  let g = game;
  while (g.state.phase.t !== 'night' && g.state.phase.t !== 'gameOver') {
    if (g.state.phase.t === 'voting') throw new Error('skipDay: неожиданное голосование');
    g = proceed(g);
  }
  return g;
}

export function alive(game: Game, seat: number): boolean {
  return game.state.players.find((p) => p.seat === seat)?.alive === true;
}

export function deathsSeats(game: Game): number[] {
  const n = game.state.nights[game.state.nights.length - 1];
  return (n?.deaths ?? []).map((d) => Number(d.playerId.slice(1)));
}
