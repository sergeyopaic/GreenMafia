// GAME_DESIGN.md §4.3a — the Don, the new wake order, blocked steps and the new defaults.
import { describe, expect, it } from 'vitest';
import {
  CLASSIC_SETTINGS,
  type Role,
  getDonResult,
  getNightStepView,
  getRoleCard,
  recommendedComposition,
  validateComposition,
} from '../src';
import { act, alive, deathsSeats, discuss, expectError, id, night, proceed, setup, skipDay, vote } from './helpers';

const FULL = { firstNight: 'full' as const };
/** Seats: 1 Don, 2 mafia, 3 commissar, 4 doctor, 5 lover, 6 maniac, 7–10 civilians. */
const DON: Role[] = ['don', 'mafia', 'commissar', 'doctor', 'lover', 'maniac', 'civilian', 'civilian', 'civilian', 'civilian'];
/** Seats: 1 Don (the only mafia), 2 commissar, 3 doctor, 4 lover, 5 maniac, 6–10 civilians. */
const LONE_DON: Role[] = ['don', 'commissar', 'doctor', 'lover', 'maniac', 'civilian', 'civilian', 'civilian', 'civilian', 'civilian'];

function walkTo(game: ReturnType<typeof setup>, step: string) {
  let g = game;
  while (getNightStepView(g.state)?.step !== step) {
    const v = getNightStepView(g.state);
    if (v && !v.fake && !v.blocked && v.step !== 'meeting') g = act(g, { type: 'NightChoose', target: null });
    g = proceed(g);
  }
  return g;
}

describe('порядок пробуждения', () => {
  it('любовница, комиссар, доктор, мафия с доном, дон, маньяк', () => {
    expect(setup(DON, FULL).state.nights[0]?.steps).toEqual(['lover', 'commissar', 'doctor', 'mafia', 'don', 'maniac']);
  });

  it('на шаге мафии просыпаются все мафиози и дон', () => {
    const g = walkTo(setup(DON, FULL), 'mafia');
    expect(getNightStepView(g.state)?.actors.map((p) => p.seat)).toEqual([1, 2]);
  });

  it('в ночь знакомства дон знакомится с мафией', () => {
    expect(getRoleCard(setup(DON).state, id(1))?.partners.map((p) => p.seat)).toEqual([2]);
    expect(getRoleCard(setup(DON).state, id(2))?.partners.map((p) => p.seat)).toEqual([1]);
  });
});

describe('проверка дона', () => {
  it('комиссар → «Комиссар», мирный → «Не комиссар»', () => {
    let g = walkTo(setup(DON, FULL), 'don');
    g = act(g, { type: 'NightChoose', target: id(3) });
    expect(getDonResult(g.state)).toBe('commissar');
    g = act(g, { type: 'NightChoose', target: id(7) });
    expect(getDonResult(g.state)).toBe('notCommissar');
    g = night(proceed(g));
    expect(g.state.nights[0]?.donResult).toBe('notCommissar');
  });

  it('дон не может проверить себя', () => {
    const g = walkTo(setup(DON, FULL), 'don');
    expectError(g, { type: 'NightChoose', target: id(1) }, 'night.target');
  });

  it('любовница у дона: проверки нет, «Нет ответа», но мафия убивает (решает №2)', () => {
    let g = act(setup(DON, FULL), { type: 'NightChoose', target: id(1) });
    g = walkTo(proceed(g), 'mafia');
    expect(getNightStepView(g.state)?.blocked).toBe(false);
    g = walkTo(proceed(act(g, { type: 'NightChoose', target: id(7) })), 'don');
    expect(getNightStepView(g.state)?.blocked).toBe(true);
    expectError(g, { type: 'NightChoose', target: id(3) }, 'night.blocked');
    g = night(proceed(g));
    expect(g.state.nights[0]?.donResult).toBe('noAnswer');
    expect(deathsSeats(g)).toEqual([7]);
  });

  it('выбывший дон — фиктивное пробуждение', () => {
    let g = night(setup(DON, FULL), { maniac: 1 });
    g = walkTo(skipDay(g), 'don');
    expect(getNightStepView(g.state)?.fake).toBe(true);
  });
});

describe('дон в команде мафии', () => {
  it('комиссар видит дона как мафию', () => {
    const g = night(setup(DON, FULL), { commissar: 1 });
    expect(g.state.nights[0]?.checkResult).toBe('mafia');
  });

  it('мафия не может выбрать дона', () => {
    const g = walkTo(setup(DON, FULL), 'mafia');
    expectError(g, { type: 'NightChoose', target: id(1) }, 'night.target');
  });

  it('дон — последний из мафии и заблокирован: шаг мафии пропускается, убийства нет', () => {
    let g = act(setup(LONE_DON, FULL), { type: 'NightChoose', target: id(1) });
    g = walkTo(proceed(g), 'mafia');
    expect(getNightStepView(g.state)?.blocked).toBe(true);
    g = night(proceed(g), { maniac: 8 });
    expect(deathsSeats(g)).toEqual([8]);
  });

  it('дон считается мафией для победы', () => {
    // Seats: 1 Don, 2 mafia, 3–6 civilians.
    const roles: Role[] = ['don', 'mafia', 'civilian', 'civilian', 'civilian', 'civilian'];
    let g = night(setup(roles, FULL), { mafia: 3 }); // 2 vs 3
    g = discuss(g, { 1: 4, 2: 5 });
    g = vote(g, { 4: [1, 2, 5], 5: [4] }); // 2 vs 2
    expect(g.state.pendingResult).toEqual({ winner: 'mafia', reason: 'parity' });
  });
});

describe('состав с доном', () => {
  it('дон в рекомендованном составе с 6 игроков', () => {
    expect(recommendedComposition(5)).toMatchObject({ mafia: 1, don: 0 });
    expect(recommendedComposition(6)).toMatchObject({ mafia: 1, don: 1 });
    expect(recommendedComposition(10)).toMatchObject({ mafia: 2, don: 1 });
    expect(recommendedComposition(20)).toMatchObject({ mafia: 5, don: 1 });
  });

  it('дон без мафиози допустим, два дона — нет', () => {
    const c = recommendedComposition(10);
    expect(validateComposition(10, { ...c, mafia: 0, civilian: c.civilian + c.mafia }).errors).toEqual([]);
    expect(validateComposition(10, { ...c, don: 2, civilian: c.civilian - 1 }).errors.map((e) => e.code)).toContain(
      'composition.single',
    );
  });
});

describe('новые значения по умолчанию', () => {
  it('у ночных жертв нет последнего слова, у изгнанных — есть', () => {
    expect(CLASSIC_SETTINGS.lastWordNight).toBe(false);
    expect(CLASSIC_SETTINGS.lastWordDay).toBe(true);
  });

  it('убитая ночью любовница забирает клиента с собой', () => {
    const g = night(setup(DON, FULL), { lover: 9, mafia: 5 });
    expect(deathsSeats(g)).toEqual([5, 9]);
    expect(alive(g, 9)).toBe(false);
  });

  it('заблокированный доктор не тратит ограничение: на следующую ночь цель доступна', () => {
    let g = night(setup(DON, FULL), { lover: 4 });
    g = walkTo(skipDay(g), 'doctor');
    const opt = getNightStepView(g.state)?.options.find((o) => o.player.seat === 4);
    expect(opt?.allowed).toBe(true);
  });
});
