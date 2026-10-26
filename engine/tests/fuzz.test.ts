// Random full games: every game must end, never break invariants (§13.4) and replay identically.
import { describe, expect, it } from 'vitest';
import {
  CLASSIC_SETTINGS,
  type Game,
  type GameEvent,
  type GameState,
  type Settings,
  SPORTS_SETTINGS,
  checkWinner,
  dispatch,
  getCurrentSpeaker,
  getEligibleVoters,
  getNightStepView,
  getNominationOptions,
  newGame,
  recommendedComposition,
  replay,
} from '../src';
import { createRng } from '../src/rng';

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)] as T;
}

function randomEvent(state: GameState, rng: () => number): GameEvent {
  const ph = state.phase;
  // Rare disruptions.
  if (ph.t !== 'reveal' && rng() < 0.01) {
    const alive = state.players.filter((p) => p.alive);
    return { type: 'RemovePlayer', playerId: pick(rng, alive).id, cause: 'left' };
  }
  if (state.settings.fouls && ph.t !== 'reveal' && rng() < 0.02) {
    const alive = state.players.filter((p) => p.alive);
    return { type: 'Foul', playerId: pick(rng, alive).id };
  }

  switch (ph.t) {
    case 'night': {
      const view = getNightStepView(state);
      if (!view || view.step === 'meeting' || view.fake || view.choice !== undefined) return { type: 'Proceed' };
      const allowed = view.options.filter((o) => o.allowed);
      if (allowed.length === 0 || rng() < 0.15) return { type: 'NightChoose', target: null };
      return { type: 'NightChoose', target: pick(rng, allowed).player.id };
    }
    case 'discussion': {
      const speaker = getCurrentSpeaker(state);
      const already = state.days[state.days.length - 1]?.nominations.some((n) => n.by === speaker?.id);
      const allowed = getNominationOptions(state).filter((o) => o.allowed);
      if (!already && allowed.length > 0 && rng() < 0.4) {
        return { type: 'Nominate', candidate: pick(rng, allowed).player.id };
      }
      return { type: 'Proceed' };
    }
    case 'voting': {
      const keys = ph.kind === 'allOut' ? ['yes'] : ph.candidates;
      const voters: Record<string, string[]> = Object.fromEntries(keys.map((k) => [k, []]));
      for (const v of getEligibleVoters(state)) {
        if (rng() < 0.2) continue; // abstain
        if (ph.kind === 'allOut' && rng() < 0.5) continue;
        (voters[pick(rng, keys)] as string[]).push(v.id);
      }
      return { type: 'CastVotes', voters };
    }
    default:
      return { type: 'Proceed' };
  }
}

function checkInvariants(state: GameState): void {
  const dead = new Set(state.players.filter((p) => !p.alive).map((p) => p.id));
  for (const p of state.players) {
    expect(p.alive === (p.death === null)).toBe(true);
  }
  for (const v of getEligibleVoters(state)) expect(dead.has(v.id)).toBe(false);
  const speaker = getCurrentSpeaker(state);
  if (speaker) expect(speaker.alive).toBe(true);
  if (state.phase.t === 'voting') {
    for (const c of state.phase.candidates) expect(dead.has(c)).toBe(false);
  }
  for (const night of state.nights) {
    const seats = night.deaths.map((d) => state.players.find((p) => p.id === d.playerId)?.seat ?? 0);
    expect(seats).toEqual([...seats].sort((a, b) => a - b));
    expect(new Set(night.deaths.map((d) => d.playerId)).size).toBe(night.deaths.length);
  }
  // Ongoing game ⇒ no win condition holds right now (unless a win is pending announcement).
  if (state.phase.t !== 'gameOver' && state.phase.t !== 'morning' && state.phase.t !== 'verdict') {
    expect(checkWinner(state.players, state.settings.earlyWinDetection)).toBeNull();
  }
}

function playRandomGame(seed: number, settings: Settings): Game {
  const rng = createRng(`fuzz-${seed}`);
  const n = 5 + Math.floor(rng() * 16);
  const created = newGame({
    type: 'CreateGame',
    settings,
    players: Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: '' })),
    composition: recommendedComposition(n),
    dealing: 'app',
    seed: `deal-${seed}`,
  });
  if (!created.ok) throw new Error(created.error.message);
  let game = created.value;

  for (let step = 0; step < 3000 && game.state.phase.t !== 'gameOver'; step++) {
    const event = randomEvent(game.state, rng);
    const r = dispatch(game, event);
    if (!r.ok) throw new Error(`seed ${seed}, шаг ${step}: ${event.type} → ${r.error.message}`);
    game = r.value;
    checkInvariants(game.state);
  }
  return game;
}

const VARIANTS: [string, Settings][] = [
  ['классика', CLASSIC_SETTINGS],
  ['спорт', SPORTS_SETTINGS],
  [
    'всё включено',
    {
      ...CLASSIC_SETTINGS,
      firstNight: 'full',
      openSetup: false,
      loverProtects: true,
      loverDeathLink: true,
      doctorSelfHealLimit: null,
      alibiClientCanVote: false,
      tieRule: 'revoteThenNobody',
      earlyWinDetection: false,
      fouls: true,
      mafiaCanTargetMafia: true,
    },
  ],
];

const GAMES = 200;

describe('случайные игры', () => {
  for (const [name, settings] of VARIANTS) {
    it(`${name}: ${GAMES} игр доходят до финала без нарушений`, () => {
      const winners: Record<string, number> = {};
      for (let seed = 0; seed < GAMES; seed++) {
        const game = playRandomGame(seed, settings);
        expect(game.state.phase.t, `seed ${seed}`).toBe('gameOver');
        if (game.state.phase.t === 'gameOver') {
          const w = game.state.phase.result.winner;
          winners[w] = (winners[w] ?? 0) + 1;
          expect(checkWinner(game.state.players, settings.earlyWinDetection)).toEqual(game.state.phase.result);
        }
        if (seed % 25 === 0) {
          const r = replay(JSON.parse(JSON.stringify(game.events)));
          expect(r.ok && r.value.state).toEqual(game.state);
        }
      }
      // Each side must be able to win at all.
      expect(winners.town ?? 0).toBeGreaterThan(0);
      expect(winners.mafia ?? 0).toBeGreaterThan(0);
    }, 120_000);
  }
});
