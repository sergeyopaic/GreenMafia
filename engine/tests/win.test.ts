// GAME_DESIGN.md §18 — win scenarios 44–55.
import { describe, expect, it } from 'vitest';
import { type Role, evaluateCounts } from '../src';
import { act, discuss, expectError, id, night, proceed, setup, skipDay, toDiscussion, vote } from './helpers';

const FULL = { firstNight: 'full' as const };

describe('победа: подсчёт', () => {
  const cases: [string, number, number, number, string | null][] = [
    ['46. маньяк вдвоём с мирным', 0, 1, 1, 'maniac'],
    ['маньяк один', 0, 1, 0, 'maniac'],
    ['47. город после взаимного убийства', 0, 0, 1, 'town'],
    ['49. 2 мафии против маньяка', 2, 1, 0, 'mafia'],
    ['50. мафиози против маньяка — ничья', 1, 1, 0, 'draw'],
    ['52. 3 / 1 / 1 — мафия досрочно', 3, 1, 1, 'mafia'],
    ['53. 2 / 1 / 1 — продолжается', 2, 1, 1, null],
    ['1 / 1 / 1 — продолжается', 1, 1, 1, null],
    ['паритет 3 / 0 / 3', 3, 0, 3, 'mafia'],
    ['перевес мафии 2 / 0 / 1', 2, 0, 1, 'mafia'],
    ['2 / 0 / 3 — продолжается', 2, 0, 3, null],
    ['0 / 1 / 2 — продолжается', 0, 1, 2, null],
    ['все погибли — ничья', 0, 0, 0, 'draw'],
  ];
  for (const [name, M, K, T, winner] of cases) {
    it(name, () => {
      expect(evaluateCounts({ M, K, T }, true)?.winner ?? null).toBe(winner);
    });
  }

  it('51. earlyWinDetection = нет: 2 / 1 / 0 и 1 / 1 / 0 продолжаются', () => {
    expect(evaluateCounts({ M: 2, K: 1, T: 0 }, false)).toBeNull();
    expect(evaluateCounts({ M: 1, K: 1, T: 0 }, false)).toBeNull();
    expect(evaluateCounts({ M: 3, K: 1, T: 1 }, false)).toBeNull();
  });

  it('55. перебор: срабатывает ровно одно правило из §9.2 или «продолжается»', () => {
    // Independent copy of the table from the design doc.
    const rules: [(M: number, K: number, T: number) => boolean, string][] = [
      [(M, K, T) => M + K + T === 0, 'draw'],
      [(M, K, T) => M === 0 && K === 0 && T >= 1, 'town'],
      [(M, K, T) => M === 0 && K === 1 && T <= 1, 'maniac'],
      [(M, K, T) => M >= 1 && K === 0 && M >= T, 'mafia'],
      [(M, K, T) => M >= 1 && K === 1 && M >= T + 2, 'mafia'],
      [(M, K, T) => M === 1 && K === 1 && T === 0, 'draw'],
    ];
    for (let M = 0; M <= 6; M++) {
      for (let K = 0; K <= 1; K++) {
        for (let T = 0; T <= 14; T++) {
          const hits = rules.filter(([r]) => r(M, K, T));
          expect(hits.length, `M=${M} K=${K} T=${T}`).toBeLessThanOrEqual(1);
          expect(evaluateCounts({ M, K, T }, true)?.winner ?? null, `M=${M} K=${K} T=${T}`).toBe(
            hits[0]?.[1] ?? null,
          );
        }
      }
    }
  });
});

describe('победа: в игре', () => {
  // Seats 1–3 mafia, 4–8 civilians.
  const MAFIA3: Role[] = ['mafia', 'mafia', 'mafia', 'civilian', 'civilian', 'civilian', 'civilian', 'civilian'];

  it('44. паритет после ночи: победа мафии утром, без последнего слова', () => {
    let g = night(setup(MAFIA3, FULL), {}); // mafia misses
    g = discuss(g, { 1: 4, 2: 5 });
    g = vote(g, { 4: [1, 2, 3, 5] }); // 3 / 0 / 4
    expect(g.state.pendingResult).toBeNull();
    g = skipDay(g);
    g = night(g, { mafia: 5 }); // 3 / 0 / 3
    expect(g.state.phase.t).toBe('morning');
    expect(g.state.pendingResult).toEqual({ winner: 'mafia', reason: 'parity' });
    g = proceed(g);
    expect(g.state.phase).toEqual({ t: 'gameOver', result: { winner: 'mafia', reason: 'parity' } });
  });

  it('45. после изгнания последней мафии: победа города без последнего слова', () => {
    const roles: Role[] = ['mafia', 'commissar', 'civilian', 'civilian', 'civilian', 'civilian'];
    let g = toDiscussion(proceed(setup(roles)));
    g = discuss(g, { 2: 1, 3: 4 });
    g = vote(g, { 1: [2, 3, 4, 5, 6], 4: [1] });
    expect(g.state.phase).toMatchObject({ t: 'verdict', eliminated: [id(1)] });
    g = proceed(g);
    expect(g.state.phase).toEqual({ t: 'gameOver', result: { winner: 'town', reason: 'allEvilDead' } });
  });

  // Seats: 1 mafia, 2 maniac, 3–5 civilians.
  const DUEL: Role[] = ['mafia', 'maniac', 'civilian', 'civilian', 'civilian'];

  it('47. мафия и маньяк убивают друг друга: победа города', () => {
    let g = night(setup(DUEL, FULL), { mafia: 3, maniac: 4 }); // 1 / 1 / 1
    expect(g.state.pendingResult).toBeNull();
    g = skipDay(g);
    g = night(g, { mafia: 2, maniac: 1 });
    expect(g.state.pendingResult).toEqual({ winner: 'town', reason: 'allEvilDead' });
  });

  it('48. мафия убила мирного, маньяк — мафиози: победа маньяка', () => {
    let g = night(setup(DUEL, FULL), { mafia: 3, maniac: 4 });
    g = skipDay(g);
    g = night(g, { mafia: 5, maniac: 1 });
    expect(g.state.pendingResult).toEqual({ winner: 'maniac', reason: 'maniacLast' });
  });

  it('54. последний мафиози покинул игру днём: сразу победа города', () => {
    const roles: Role[] = ['mafia', 'commissar', 'civilian', 'civilian', 'civilian', 'civilian'];
    let g = toDiscussion(proceed(setup(roles)));
    g = act(g, { type: 'RemovePlayer', playerId: id(1), cause: 'left' });
    expect(g.state.phase).toEqual({ t: 'gameOver', result: { winner: 'town', reason: 'allEvilDead' } });
    expect(g.state.players[0]?.death).toEqual({ cause: 'left', phase: 'day', number: 1 });
  });

  it('после финала события не принимаются', () => {
    const roles: Role[] = ['mafia', 'commissar', 'civilian', 'civilian', 'civilian', 'civilian'];
    let g = toDiscussion(proceed(setup(roles)));
    g = act(g, { type: 'RemovePlayer', playerId: id(1), cause: 'left' });
    expectError(g, { type: 'Proceed' }, 'game.over');
  });

  it('ручное завершение: ничья', () => {
    const g = act(setup(MAFIA3), { type: 'EndGame', result: 'draw' });
    expect(g.state.phase).toEqual({ t: 'gameOver', result: { winner: 'draw', reason: 'manual' } });
  });
});
