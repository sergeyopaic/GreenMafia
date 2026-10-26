// GAME_DESIGN.md §18 — service scenarios 56–60, plus setup, removal and fouls (§5, §11).
import { describe, expect, it } from 'vitest';
import {
  CLASSIC_SETTINGS,
  type Role,
  canUndo,
  getCurrentSpeaker,
  getRoleCard,
  newGame,
  recommendedComposition,
  replay,
  undo,
  validateComposition,
} from '../src';
import { BASE, NINE, act, defend, discuss, expectError, id, night, proceed, setup, toDiscussion, vote } from './helpers';

function appGame(seed: string, n = 10) {
  const r = newGame({
    type: 'CreateGame',
    settings: CLASSIC_SETTINGS,
    players: Array.from({ length: n }, (_, i) => ({ id: id(i + 1), name: '' })),
    composition: recommendedComposition(n),
    dealing: 'app',
    seed,
  });
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

describe('отмена и журнал', () => {
  it('56. отмена последнего голоса возвращает состояние до голоса', () => {
    const before = discuss(toDiscussion(proceed(setup(NINE))), { 1: 7, 2: 8 });
    const after = vote(before, { 7: [1, 2, 3], 8: [4] });
    expect(undo(after).state).toEqual(before.state);
  });

  it('57. отмена после финала — игра снова идёт', () => {
    const roles: Role[] = ['mafia', 'commissar', 'civilian', 'civilian', 'civilian', 'civilian'];
    const g = act(toDiscussion(proceed(setup(roles))), { type: 'RemovePlayer', playerId: id(1), cause: 'left' });
    expect(g.state.phase.t).toBe('gameOver');
    expect(undo(g).state.phase.t).toBe('discussion');
  });

  it('58–59. состояние восстанавливается из журнала (в т.ч. после JSON)', () => {
    let g = setup(BASE, { firstNight: 'full' });
    g = act(g, { type: 'NightChoose', target: id(7) });
    g = proceed(g);
    g = act(g, { type: 'NightChoose', target: id(8) });
    const saved = JSON.parse(JSON.stringify(g.events));
    const r = replay(saved);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.state).toEqual(g.state);
  });

  it('создание игры отменить нельзя', () => {
    const g = setup(NINE);
    expect(canUndo(g)).toBe(false);
    expect(undo(g)).toBe(g);
  });

  it('ошибочное событие не меняет игру', () => {
    const g = setup(NINE);
    const before = structuredClone(g.state);
    expectError(g, { type: 'Nominate', candidate: id(2) });
    expect(g.state).toEqual(before);
  });
});

describe('раздача ролей', () => {
  it('60. одно и то же зерно — одна и та же раздача', () => {
    const a = appGame('seed-42').state.players.map((p) => p.role);
    const b = appGame('seed-42').state.players.map((p) => p.role);
    const c = appGame('seed-43').state.players.map((p) => p.role);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('раздача соответствует составу', () => {
    for (let n = 5; n <= 20; n++) {
      const g = appGame(`s${n}`, n);
      const comp = recommendedComposition(n);
      for (const [role, count] of Object.entries(comp)) {
        expect(g.state.players.filter((p) => p.role === role).length).toBe(count);
      }
      expect(g.state.phase).toEqual({ t: 'reveal', index: 0 });
    }
  });

  it('передача телефона по кругу, затем ночь знакомства', () => {
    let g = appGame('x');
    for (let i = 0; i < 10; i++) g = proceed(g);
    expect(g.state.phase).toEqual({ t: 'night', number: 1, stepIndex: 0 });
  });

  it('пустое имя заменяется на «Игрок N»', () => {
    expect(appGame('x').state.players[2]?.name).toBe('Игрок 3');
  });

  it('карта мафиози показывает сообщников', () => {
    const g = setup(BASE);
    expect(getRoleCard(g.state, id(1))?.partners.map((p) => p.seat)).toEqual([2]);
    expect(getRoleCard(g.state, id(3))?.partners).toEqual([]);
  });

  it('ручная раздача должна совпадать с составом', () => {
    const composition = recommendedComposition(5);
    const r = newGame({
      type: 'CreateGame',
      settings: CLASSIC_SETTINGS,
      players: Array.from({ length: 5 }, (_, i) => ({ id: id(i + 1), name: '' })),
      composition,
      dealing: 'cards',
      roles: ['mafia', 'mafia', 'civilian', 'civilian', 'civilian'],
    });
    expect(r.ok).toBe(false);
  });
});

describe('состав', () => {
  it('рекомендованная таблица проходит проверку для 5–20 игроков', () => {
    for (let n = 5; n <= 20; n++) {
      expect(validateComposition(n, recommendedComposition(n)).errors).toEqual([]);
      expect(validateComposition(n, recommendedComposition(n)).balance).toBe('balanced');
    }
  });

  it('ошибки состава', () => {
    const c = recommendedComposition(10);
    expect(validateComposition(10, { ...c, mafia: 0, don: 0, civilian: c.civilian + c.mafia + c.don }).errors.map((e) => e.code)).toContain(
      'composition.noMafia',
    );
    expect(validateComposition(10, { ...c, doctor: 2, civilian: c.civilian - 1 }).errors.map((e) => e.code)).toContain(
      'composition.single',
    );
    expect(validateComposition(10, { ...c, civilian: c.civilian + 1 }).errors.map((e) => e.code)).toContain(
      'composition.total',
    );
    expect(validateComposition(6, { mafia: 3, don: 0, commissar: 0, doctor: 0, lover: 0, maniac: 0, civilian: 3 }).errors.map((e) => e.code)).toContain(
      'composition.startWin',
    );
    expect(validateComposition(21, recommendedComposition(20)).errors.map((e) => e.code)).toContain('players.range');
  });

  it('перевес мафии подсвечивается', () => {
    const c = recommendedComposition(10);
    expect(validateComposition(10, { ...c, mafia: 4, civilian: c.civilian - 1 }).balance).toBe('mafia');
  });
});

describe('удаление игрока (§11.1)', () => {
  it('удалённый кандидат снимается, голосование начинается заново', () => {
    let g = discuss(toDiscussion(proceed(setup(NINE))), { 1: 7, 2: 8, 3: 9 });
    g = act(g, { type: 'RemovePlayer', playerId: id(9), cause: 'removed' });
    expect(g.state.phase).toMatchObject({ t: 'voting', kind: 'main', candidates: [id(7), id(8)] });
  });

  it('удаление во время попила возвращает к основному голосованию', () => {
    let g = discuss(toDiscussion(proceed(setup(NINE))), { 1: 7, 2: 8, 3: 9 });
    g = vote(g, { 7: [1, 2], 8: [3, 4], 9: [5] });
    expect(g.state.phase.t).toBe('defense');
    g = act(g, { type: 'RemovePlayer', playerId: id(6), cause: 'left' });
    expect(g.state.phase).toMatchObject({ t: 'voting', kind: 'main', candidates: [id(7), id(8), id(9)] });
  });

  it('removalCancelsVote: удаление днём отменяет голосование', () => {
    let g = toDiscussion(proceed(setup(NINE, { removalCancelsVote: true })));
    g = act(g, { type: 'Nominate', candidate: id(7) });
    g = act(g, { type: 'RemovePlayer', playerId: id(9), cause: 'removed' });
    g = discuss(g, { 2: 8 });
    expect(g.state.phase).toMatchObject({ t: 'verdict', reason: 'removalCancelled', eliminated: [] });
  });

  it('удалённый говорящий — слово переходит следующему', () => {
    let g = toDiscussion(proceed(setup(NINE)));
    g = act(g, { type: 'RemovePlayer', playerId: id(1), cause: 'left' });
    expect(getCurrentSpeaker(g.state)?.seat).toBe(2);
  });

  it('удаление ночью: выбор удалённого не срабатывает', () => {
    let g = setup(BASE, { firstNight: 'full' });
    g = proceed(act(g, { type: 'NightChoose', target: null })); // lover
    g = proceed(act(g, { type: 'NightChoose', target: id(7) })); // mafia
    g = proceed(act(g, { type: 'NightChoose', target: null })); // maniac
    g = proceed(act(g, { type: 'NightChoose', target: id(7) })); // doctor heals 7
    g = act(g, { type: 'RemovePlayer', playerId: id(4), cause: 'left' }); // doctor leaves
    g = night(g);
    expect(g.state.nights[0]?.deaths.map((d) => d.playerId)).toEqual([id(7)]);
  });

  it('во время раздачи удалять нельзя', () => {
    expectError(appGame('x'), { type: 'RemovePlayer', playerId: id(1), cause: 'left' }, 'remove.reveal');
  });
});

describe('фолы (§11.2)', () => {
  it('выключены по умолчанию', () => {
    expectError(setup(NINE), { type: 'Foul', playerId: id(1) }, 'foul.off');
  });

  it('3-й фол — пропуск следующей речи, 4-й — удаление', () => {
    let g = toDiscussion(proceed(setup(NINE, { fouls: true })));
    for (let i = 0; i < 3; i++) g = act(g, { type: 'Foul', playerId: id(2) });
    expect(g.state.players[1]?.skipNextSpeech).toBe(true);
    g = proceed(g); // speaker 1 done → 2 is skipped
    expect(getCurrentSpeaker(g.state)?.seat).toBe(3);
    expect(g.state.players[1]?.skipNextSpeech).toBe(false);
    g = act(g, { type: 'Foul', playerId: id(2) });
    expect(g.state.players[1]?.alive).toBe(false);
    expect(g.state.players[1]?.death?.cause).toBe('removed');
  });
});

describe('ничья и защита: хроника', () => {
  it('все раунды голосования сохраняются', () => {
    let g = discuss(toDiscussion(proceed(setup(NINE))), { 1: 7, 2: 8 });
    g = defend(vote(g, { 7: [1, 2, 3], 8: [4, 5, 6] }));
    g = vote(g, { 7: [1, 2, 3, 4], 8: [5] });
    const rounds = g.state.days[0]?.rounds ?? [];
    expect(rounds.map((r) => r.kind)).toEqual(['main', 'revote']);
    expect(rounds[0]?.voters?.[id(7)]).toEqual([id(1), id(2), id(3)]);
  });
});
