// GAME_DESIGN.md §18 — day scenarios 28–43.
import { describe, expect, it } from 'vitest';
import { dispatch, getCurrentSpeaker, getEligibleVoters, getNominationOptions } from '../src';
import {
  BASE,
  NINE,
  act,
  alive,
  defend,
  discuss,
  expectError,
  id,
  night,
  proceed,
  setup,
  skipDay,
  toDiscussion,
  vote,
} from './helpers';

const FULL = { firstNight: 'full' as const };

/** Classic game, meeting night done, day 1 discussion. */
function day1(roles = NINE, settings = {}) {
  return toDiscussion(proceed(setup(roles, settings)));
}

/** Day 2 discussion with nobody dead. */
function day2(roles = NINE, settings = {}) {
  let g = skipDay(day1(roles, settings));
  g = night(g);
  return toDiscussion(g);
}

describe('день: алиби', () => {
  it('28. клиента с алиби нельзя выставить, но он голосует', () => {
    let g = night(setup(BASE, FULL), { lover: 7 });
    g = toDiscussion(g);
    expect(getCurrentSpeaker(g.state)?.seat).toBe(1);
    const msg = expectError(g, { type: 'Nominate', candidate: id(7) }, 'day.nominate');
    expect(msg).toBe('У №7 алиби');
    const r = dispatch(g, { type: 'Nominate', candidate: id(7) });
    expect(!r.ok && r.error.params).toEqual({ seat: 7, reason: 'nominate.alibi' });
    expect(getNominationOptions(g.state).find((o) => o.player.seat === 7)?.allowed).toBe(false);
    expect(getEligibleVoters(g.state).map((p) => p.seat)).toContain(7);
  });

  it('29. alibiClientCanVote = нет: клиент не голосует', () => {
    let g = night(setup(BASE, { ...FULL, alibiClientCanVote: false }), { lover: 7 });
    g = discuss(g, { 1: 8, 2: 9 });
    expect(getEligibleVoters(g.state).map((p) => p.seat)).not.toContain(7);
    expectError(g, { type: 'CastVotes', voters: { [id(8)]: [id(7)] } }, 'vote.voter');
  });

  it('алиби действует только один день', () => {
    let g = night(setup(BASE, FULL), { lover: 7 });
    g = skipDay(g);
    g = night(g);
    g = toDiscussion(g);
    expect(getNominationOptions(g.state).find((o) => o.player.seat === 7)?.allowed).toBe(true);
  });
});

describe('день: когда голосования нет', () => {
  it('30. никто не выставлен → голосования нет, затем ночь', () => {
    let g = discuss(day1());
    expect(g.state.phase).toMatchObject({ t: 'verdict', reason: 'noCandidates', eliminated: [] });
    g = proceed(g);
    expect(g.state.phase).toMatchObject({ t: 'night', number: 2 });
  });

  it('31. День 1, единственный кандидат — не голосуется', () => {
    const g = discuss(day1(), { 1: 7 });
    expect(g.state.phase).toMatchObject({ t: 'verdict', reason: 'firstDaySingle' });
    expect(alive(g, 7)).toBe(true);
  });

  it('firstDayVoting = нет: в День 1 голосования нет', () => {
    const g = discuss(day1(NINE, { firstDayVoting: false }), { 1: 7, 2: 8 });
    expect(g.state.phase).toMatchObject({ t: 'verdict', reason: 'firstDayNoVoting' });
  });

  it('32. День 2, единственный кандидат с 0 голосов не выбывает', () => {
    let g = discuss(day2(), { 2: 7 });
    expect(g.state.phase).toMatchObject({ t: 'voting', kind: 'main', candidates: [id(7)] });
    g = vote(g, {});
    expect(g.state.phase).toMatchObject({ t: 'verdict', reason: 'noVotes', eliminated: [] });
  });

  it('День 2, единственный кандидат с 1 голосом выбывает', () => {
    let g = discuss(day2(), { 2: 7 });
    g = vote(g, { 7: [1] });
    expect(g.state.phase).toMatchObject({ t: 'verdict', reason: 'eliminated', eliminated: [id(7)] });
  });

  it('33. singleCandidateAutoEliminate: единственный кандидат уходит без голосования', () => {
    const g = discuss(day2(NINE, { singleCandidateAutoEliminate: true }), { 2: 7 });
    expect(g.state.phase).toMatchObject({ t: 'verdict', reason: 'autoSingle', eliminated: [id(7)] });
    expect(alive(g, 7)).toBe(false);
  });
});

describe('день: голосование и ничьи', () => {
  it('34. ничья → попил → единственный лидер выбывает', () => {
    let g = discuss(day1(), { 1: 7, 2: 8 });
    g = vote(g, { 7: [1, 2, 3], 8: [4, 5, 6] });
    expect(g.state.phase).toMatchObject({ t: 'defense', queue: [id(7), id(8)] });
    g = defend(g);
    expect(g.state.phase).toMatchObject({ t: 'voting', kind: 'revote', candidates: [id(7), id(8)] });
    g = vote(g, { 7: [1, 2, 3, 4], 8: [5, 6] });
    expect(g.state.phase).toMatchObject({ t: 'verdict', reason: 'eliminated', eliminated: [id(7)] });
  });

  it('35. повторная ничья → подъём всех: 5 из 9 «за» → выбывают оба', () => {
    let g = discuss(day1(), { 1: 7, 2: 8 });
    g = defend(vote(g, { 7: [1, 2, 3], 8: [4, 5, 6] }));
    g = vote(g, { 7: [1, 2, 3], 8: [4, 5, 6] });
    expect(g.state.phase).toMatchObject({ t: 'voting', kind: 'allOut', candidates: [id(7), id(8)] });
    g = vote(g, { yes: [1, 2, 3, 4, 5] });
    expect(g.state.phase).toMatchObject({ t: 'verdict', reason: 'allOut', eliminated: [id(7), id(8)] });
  });

  it('36. подъём всех: 4 из 9 «за» → никто не выбывает', () => {
    let g = discuss(day1(), { 1: 7, 2: 8 });
    g = defend(vote(g, { 7: [1, 2, 3], 8: [4, 5, 6] }));
    g = vote(g, { 7: [1, 2, 3], 8: [4, 5, 6] });
    g = vote(g, { yes: [1, 2, 3, 4] });
    expect(g.state.phase).toMatchObject({ t: 'verdict', reason: 'allOutFailed', eliminated: [] });
  });

  it('37. ничья троих → переголосование сужает ничью до двоих', () => {
    let g = discuss(day1(), { 1: 7, 2: 8, 3: 9 });
    g = defend(vote(g, { 7: [1, 2, 3], 8: [4, 5, 6], 9: [7, 8, 9] }));
    g = vote(g, { 7: [1, 2, 3, 4], 8: [5, 6, 7, 8], 9: [9] });
    expect(g.state.phase).toMatchObject({ t: 'defense', candidates: [id(7), id(8)] });
    g = defend(g);
    expect(g.state.phase).toMatchObject({ t: 'voting', kind: 'revote', candidates: [id(7), id(8)] });
  });

  it('38. tieRule = nobody: при ничьей никто не выбывает', () => {
    let g = discuss(day1(NINE, { tieRule: 'nobody' }), { 1: 7, 2: 8 });
    g = vote(g, { 7: [1, 2], 8: [3, 4] });
    expect(g.state.phase).toMatchObject({ t: 'verdict', reason: 'tieNobody' });
  });

  it('tieRule = revoteThenNobody: одно переголосование, затем никто', () => {
    let g = discuss(day1(NINE, { tieRule: 'revoteThenNobody' }), { 1: 7, 2: 8 });
    g = defend(vote(g, { 7: [1, 2], 8: [3, 4] }));
    g = vote(g, { 7: [1, 2], 8: [3, 4] });
    expect(g.state.phase).toMatchObject({ t: 'verdict', reason: 'tieNobody' });
  });

  it('39. воздержаться нельзя: молчащие голосуют за последнего кандидата', () => {
    let g = discuss(day1(NINE, { abstainAllowed: false }), { 1: 7, 2: 8 });
    g = vote(g, { 7: [1, 2, 3], 8: [4, 5] });
    const round = g.state.days[0]?.rounds[0];
    expect(round?.forced).toBe(4);
    expect(round?.counts[id(8)]).toBe(6);
    expect(g.state.phase).toMatchObject({ t: 'verdict', eliminated: [id(8)] });
  });

  it('40. повторный голос — ошибка', () => {
    const g = discuss(day1(), { 1: 7, 2: 8 });
    expectError(g, { type: 'CastVotes', voters: { [id(7)]: [id(1)], [id(8)]: [id(1)] } }, 'vote.twice');
  });

  it('голос не за кандидата — ошибка', () => {
    const g = discuss(day1(), { 1: 7, 2: 8 });
    expectError(g, { type: 'CastVotes', voters: { [id(9)]: [id(1)] } }, 'vote.candidate');
  });

  it('быстрый ввод числом: сумма не больше голосующих', () => {
    let g = discuss(day1(), { 1: 7, 2: 8 });
    expectError(g, { type: 'CastVotes', counts: { [id(7)]: 5, [id(8)]: 5 } }, 'vote.tooMany');
    g = act(g, { type: 'CastVotes', counts: { [id(7)]: 5, [id(8)]: 3 } });
    expect(g.state.phase).toMatchObject({ t: 'verdict', eliminated: [id(7)] });
  });

  it('пока голоса не внесены, дальше не пройти', () => {
    const g = discuss(day1(), { 1: 7, 2: 8 });
    expectError(g, { type: 'Proceed' }, 'vote.pending');
  });

  it('изгнанный говорит последнее слово, затем ночь', () => {
    let g = discuss(day1(), { 1: 7, 2: 8 });
    g = vote(g, { 7: [1, 2, 3], 8: [4] });
    g = proceed(g);
    expect(g.state.phase).toMatchObject({ t: 'lastWords', queue: [id(7)], then: 'night' });
    g = proceed(g);
    expect(g.state.phase).toMatchObject({ t: 'night', number: 2 });
  });

  it('lastWordDay = нет: сразу ночь', () => {
    let g = discuss(day1(NINE, { lastWordDay: false }), { 1: 7, 2: 8 });
    g = proceed(vote(g, { 7: [1, 2, 3], 8: [4] }));
    expect(g.state.phase).toMatchObject({ t: 'night', number: 2 });
  });
});

describe('день: выставление', () => {
  it('41. нельзя выставить себя', () => {
    const g = day1();
    expectError(g, { type: 'Nominate', candidate: id(1) }, 'day.nominate');
  });

  it('selfNomination разрешает', () => {
    const g = act(day1(NINE, { selfNomination: true }), { type: 'Nominate', candidate: id(1) });
    expect(g.state.days[0]?.nominations).toEqual([{ by: id(1), candidate: id(1) }]);
  });

  it('42. только одно выставление за речь', () => {
    const g = act(day1(), { type: 'Nominate', candidate: id(7) });
    expectError(g, { type: 'Nominate', candidate: id(8) }, 'day.nominate');
  });

  it('уже выставленного выставить нельзя', () => {
    let g = act(day1(), { type: 'Nominate', candidate: id(7) });
    g = proceed(g);
    expectError(g, { type: 'Nominate', candidate: id(7) }, 'day.nominate');
  });

  it('порядок кандидатов = порядок выставления', () => {
    const g = discuss(day1(), { 1: 9, 2: 7, 3: 8 });
    expect(g.state.phase).toMatchObject({ t: 'voting', candidates: [id(9), id(7), id(8)] });
  });
});

describe('день: очерёдность речей', () => {
  it('43. День 2 начинает следующий живой после начинавшего День 1', () => {
    let g = skipDay(day1(BASE));
    expect(g.state.days[0]?.firstSpeaker).toBe(id(1));
    g = night(g, { maniac: 2 });
    g = toDiscussion(g);
    expect(getCurrentSpeaker(g.state)?.seat).toBe(3);
    expect(g.state.days[1]?.order[0]).toBe(id(3));
    expect(g.state.days[1]?.order).not.toContain(id(2));
  });

  it('без смертей День 2 начинает №2, порядок по кругу', () => {
    const g = day2();
    expect(g.state.days[1]?.order).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 1].map(id));
  });

  it('speakingOrder = fromFirst: всегда с первого живого', () => {
    const g = day2(NINE, { speakingOrder: 'fromFirst' });
    expect(g.state.days[1]?.firstSpeaker).toBe(id(1));
  });

  it('по умолчанию у ночных жертв последнего слова нет', () => {
    let g = night(setup(BASE, FULL), { mafia: 9, maniac: 7 });
    g = proceed(g);
    expect(g.state.phase).toMatchObject({ t: 'discussion' });
  });

  it('lastWordNight: ночные жертвы говорят последнее слово до обсуждения', () => {
    let g = night(setup(BASE, { ...FULL, lastWordNight: true }), { mafia: 9, maniac: 7 });
    g = proceed(g);
    expect(g.state.phase).toMatchObject({ t: 'lastWords', queue: [id(7), id(9)], then: 'discussion' });
  });
});
