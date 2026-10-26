// GAME_DESIGN.md §18 — night scenarios 1–27.
import { describe, expect, it } from 'vitest';
import { getCommissarResult, getMorningReport, getNightStepView, playerHasAlibi, type Role } from '../src';
import { BASE, act, alive, deathsSeats, expectError, id, night, proceed, setup, skipDay, toDiscussion } from './helpers';

const FULL = { firstNight: 'full' as const };
const NO_DOCTOR: Role[] = ['mafia', 'mafia', 'commissar', 'lover', 'maniac', 'civilian', 'civilian', 'civilian', 'civilian', 'civilian'];
// seats: 1 mafia, 2 commissar, 3 doctor, 4 lover, 5 maniac, 6–10 civilians
const ONE_MAFIA: Role[] = ['mafia', 'commissar', 'doctor', 'lover', 'maniac', 'civilian', 'civilian', 'civilian', 'civilian', 'civilian'];

/** Go from the morning to the next night with no vote. */
const nextNight = skipDay;

describe('ночь: убийства и лечение', () => {
  it('1. мафия → A, доктор → A: никто не погиб', () => {
    const g = night(setup(BASE, FULL), { mafia: 7, doctor: 7 });
    expect(deathsSeats(g)).toEqual([]);
    expect(g.state.nights[0]?.saved).toEqual([id(7)]);
  });

  it('2. мафия → A, маньяк → B, доктор → A: погиб B', () => {
    const g = night(setup(BASE, FULL), { mafia: 7, maniac: 8, doctor: 7 });
    expect(deathsSeats(g)).toEqual([8]);
  });

  it('3. мафия и маньяк → A, доктор → A: никто не погиб', () => {
    const g = night(setup(BASE, FULL), { mafia: 7, maniac: 7, doctor: 7 });
    expect(deathsSeats(g)).toEqual([]);
  });

  it('4. мафия и маньяк → A без доктора: одна смерть', () => {
    const g = night(setup(NO_DOCTOR, FULL), { mafia: 7, maniac: 7 });
    expect(deathsSeats(g)).toEqual([7]);
  });

  it('5. две смерти объявляются по возрастанию номера места', () => {
    const g = night(setup(BASE, FULL), { mafia: 9, maniac: 7 });
    expect(deathsSeats(g)).toEqual([7, 9]);
    expect(getMorningReport(g.state)?.deaths.map((d) => d.player.seat)).toEqual([7, 9]);
  });
});

describe('ночь: любовница', () => {
  it('6. любовница у доктора: лечение не срабатывает', () => {
    const g = night(setup(BASE, FULL), { lover: 4, doctor: 7, mafia: 7 });
    expect(deathsSeats(g)).toEqual([7]);
    expect(g.state.nights[0]?.blocked).toBe(id(4));
  });

  it('7. любовница у комиссара: «Нет ответа»', () => {
    let g = setup(BASE, FULL);
    g = act(g, { type: 'NightChoose', target: id(3) });
    g = proceed(g); // lover → mafia
    g = proceed(act(g, { type: 'NightChoose', target: null })); // mafia miss
    g = proceed(act(g, { type: 'NightChoose', target: null })); // maniac skip
    g = proceed(act(g, { type: 'NightChoose', target: null })); // doctor skip
    expect(getNightStepView(g.state)?.step).toBe('commissar');
    expect(getNightStepView(g.state)?.blocked).toBe(true);
    g = act(g, { type: 'NightChoose', target: id(1) });
    expect(getCommissarResult(g.state)).toBe('noAnswer');
    g = proceed(g);
    expect(g.state.nights[0]?.checkResult).toBe('noAnswer');
  });

  it('8. любовница у единственного живого мафиози: убийства нет', () => {
    const g = night(setup(ONE_MAFIA, FULL), { lover: 1, mafia: 7 });
    expect(deathsSeats(g)).toEqual([]);
  });

  it('9. любовница у одного из двух мафиози: убийство происходит', () => {
    const g = night(setup(BASE, FULL), { lover: 1, mafia: 7 });
    expect(deathsSeats(g)).toEqual([7]);
  });

  it('10. любовница у маньяка: его жертва жива', () => {
    const g = night(setup(BASE, FULL), { lover: 6, maniac: 7 });
    expect(alive(g, 7)).toBe(true);
  });

  it('11. визит не защищает по умолчанию', () => {
    const g = night(setup(BASE, FULL), { lover: 7, mafia: 7 });
    expect(alive(g, 7)).toBe(false);
  });

  it('12. loverProtects: визит защищает', () => {
    const g = night(setup(BASE, { ...FULL, loverProtects: true }), { lover: 7, mafia: 7 });
    expect(alive(g, 7)).toBe(true);
    expect(g.state.nights[0]?.saved).toEqual([id(7)]);
  });

  it('13. loverDeathLink: клиент погибает вместе с любовницей', () => {
    const g = night(setup(BASE, { ...FULL, loverDeathLink: true }), { lover: 7, mafia: 5 });
    expect(deathsSeats(g)).toEqual([5, 7]);
    expect(g.state.nights[0]?.deaths.find((d) => d.playerId === id(7))?.cause).toBe('loverLink');
  });

  it('14. то же + доктор лечит клиента: погибает только любовница', () => {
    const g = night(setup(BASE, { ...FULL, loverDeathLink: true }), { lover: 7, mafia: 5, doctor: 7 });
    expect(deathsSeats(g)).toEqual([5]);
  });

  it('15. то же, но доктор лечит любовницу: никто не погиб', () => {
    const g = night(setup(BASE, { ...FULL, loverDeathLink: true }), { lover: 7, mafia: 5, doctor: 5 });
    expect(deathsSeats(g)).toEqual([]);
  });

  it('27. любовница погибла, но её клиент получает алиби', () => {
    let g = night(setup(BASE, FULL), { lover: 7, mafia: 5 });
    expect(deathsSeats(g)).toEqual([5]);
    expect(getMorningReport(g.state)?.alibi?.seat).toBe(7);
    g = toDiscussion(g);
    expect(playerHasAlibi(g.state, id(7))).toBe(true);
  });

  it('алиби не выдаётся, если клиент погиб', () => {
    const g = night(setup(BASE, FULL), { lover: 7, mafia: 7 });
    expect(g.state.alibi).toBeNull();
  });

  it('24. любовница не может прийти к тому же две ночи подряд', () => {
    let g = night(setup(BASE, FULL), { lover: 7 });
    g = nextNight(g);
    const msg = expectError(g, { type: 'NightChoose', target: id(7) }, 'night.target');
    expect(msg).toContain('№7');
  });
});

describe('ночь: доктор', () => {
  it('16. нельзя лечить одного и того же две ночи подряд, через ночь — можно', () => {
    let g = night(setup(BASE, FULL), { doctor: 7 });
    g = nextNight(g);
    // walk to doctor step of night 2
    while (getNightStepView(g.state)?.step !== 'doctor') {
      const v = getNightStepView(g.state);
      if (v && !v.fake) g = act(g, { type: 'NightChoose', target: null });
      g = proceed(g);
    }
    const opt = getNightStepView(g.state)?.options.find((o) => o.player.seat === 7);
    expect(opt?.allowed).toBe(false);
    expect(opt?.reason).toContain('прошлой ночью');
    expectError(g, { type: 'NightChoose', target: id(7) }, 'night.target');
    g = act(g, { type: 'NightChoose', target: id(8) });
    g = night(proceed(g));
    g = nextNight(g);
    // Night 3: 7 allowed.
    g = night(g, { doctor: 7 });
    expect(g.state.memory.lastDoctorTarget).toBe(id(7));
  });

  it('17. после пропуска ограничения нет', () => {
    let g = night(setup(BASE, FULL), { doctor: 7 });
    g = nextNight(g);
    g = night(g, {}); // doctor skips
    g = nextNight(g);
    g = night(g, { doctor: 7 }); // allowed
    expect(g.state.memory.lastDoctorTarget).toBe(id(7));
  });

  it('18. себя — только один раз за игру', () => {
    let g = night(setup(BASE, FULL), { doctor: 4 });
    expect(g.state.memory.doctorSelfHeals).toBe(1);
    g = nextNight(g);
    g = night(g, { doctor: 7 });
    g = nextNight(g);
    while (getNightStepView(g.state)?.step !== 'doctor') {
      const v = getNightStepView(g.state);
      if (v && !v.fake) g = act(g, { type: 'NightChoose', target: null });
      g = proceed(g);
    }
    const msg = expectError(g, { type: 'NightChoose', target: id(4) }, 'night.target');
    expect(msg).toBe('Доктор уже лечил себя');
  });

  it('безлимитное самолечение, но не две ночи подряд', () => {
    let g = night(setup(BASE, { ...FULL, doctorSelfHealLimit: null }), { doctor: 4 });
    g = nextNight(g);
    g = night(g, { doctor: 7 });
    g = nextNight(g);
    g = night(g, { doctor: 4 });
    expect(g.state.memory.doctorSelfHeals).toBe(2);
  });

  it('19. заблокированный доктор, выбравший себя, использует самолечение', () => {
    const g = night(setup(BASE, FULL), { lover: 4, doctor: 4, mafia: 4 });
    expect(g.state.memory.doctorSelfHeals).toBe(1);
    expect(alive(g, 4)).toBe(false);
  });
});

describe('ночь: комиссар', () => {
  it('20. маньяк — «Не мафия» по умолчанию', () => {
    const g = night(setup(BASE, FULL), { commissar: 6 });
    expect(g.state.nights[0]?.checkResult).toBe('notMafia');
  });

  it('21. маньяк — «Мафия» по настройке', () => {
    const g = night(setup(BASE, { ...FULL, commissarManiacResult: 'mafia' }), { commissar: 6 });
    expect(g.state.nights[0]?.checkResult).toBe('mafia');
  });

  it('22. убитый этой ночью комиссар всё равно получает ответ', () => {
    const g = night(setup(BASE, FULL), { commissar: 1, mafia: 3 });
    expect(g.state.nights[0]?.checkResult).toBe('mafia');
    expect(alive(g, 3)).toBe(false);
  });

  it('любовница и мирный — «Не мафия»', () => {
    expect(night(setup(BASE, FULL), { commissar: 5 }).state.nights[0]?.checkResult).toBe('notMafia');
    expect(night(setup(BASE, FULL), { commissar: 9 }).state.nights[0]?.checkResult).toBe('notMafia');
  });

  it('нельзя проверить себя', () => {
    let g = setup(BASE, FULL);
    while (getNightStepView(g.state)?.step !== 'commissar') {
      g = proceed(act(g, { type: 'NightChoose', target: null }));
    }
    expectError(g, { type: 'NightChoose', target: id(3) }, 'night.target');
  });
});

describe('ночь: валидация и пробуждения', () => {
  it('23. мафия не может выбрать мафиози', () => {
    let g = setup(BASE, FULL);
    g = proceed(act(g, { type: 'NightChoose', target: null })); // lover
    expect(getNightStepView(g.state)?.step).toBe('mafia');
    expectError(g, { type: 'NightChoose', target: id(2) }, 'night.target');
  });

  it('mafiaCanTargetMafia разрешает', () => {
    const g = night(setup(BASE, { ...FULL, mafiaCanTargetMafia: true }), { mafia: 2 });
    expect(alive(g, 2)).toBe(false);
  });

  it('нельзя выбрать выбывшего', () => {
    let g = night(setup(BASE, FULL), { mafia: 7 });
    g = skipDay(g);
    g = proceed(act(g, { type: 'NightChoose', target: null })); // lover
    expectError(g, { type: 'NightChoose', target: id(7) }, 'night.target');
  });

  it('без выбора дальше не пройти', () => {
    const g = setup(BASE, FULL);
    expectError(g, { type: 'Proceed' }, 'night.noChoice');
  });

  it('25. выбывший комиссар — фиктивное пробуждение', () => {
    let g = night(setup(BASE, FULL), { mafia: 3 });
    g = skipDay(g);
    while (getNightStepView(g.state)?.step !== 'commissar') {
      g = proceed(act(g, { type: 'NightChoose', target: null }));
    }
    const view = getNightStepView(g.state);
    expect(view?.fake).toBe(true);
    expect(view?.options.every((o) => !o.allowed)).toBe(true);
    expectError(g, { type: 'NightChoose', target: id(1) }, 'night.fake');
    g = proceed(g);
    expect(g.state.phase.t).toBe('morning');
  });

  it('fakeWakes = нет: шаг выбывшей роли пропускается', () => {
    let g = night(setup(BASE, { ...FULL, fakeWakes: false }), { mafia: 3 });
    g = skipDay(g);
    expect(g.state.nights[1]?.steps).toEqual(['lover', 'mafia', 'maniac', 'doctor']);
  });

  it('открытый состав: отсутствующих ролей нет в ночи', () => {
    const g = setup(['mafia', 'commissar', 'civilian', 'civilian', 'civilian'], FULL);
    expect(g.state.nights[0]?.steps).toEqual(['mafia', 'commissar']);
  });

  it('скрытый состав: все роли будятся, отсутствующие — фиктивно', () => {
    const g = setup(['mafia', 'commissar', 'civilian', 'civilian', 'civilian'], { ...FULL, openSetup: false });
    expect(g.state.nights[0]?.steps).toEqual(['lover', 'mafia', 'maniac', 'doctor', 'commissar']);
    expect(getNightStepView(g.state)?.fake).toBe(true);
  });

  it('26. ночь знакомства: только мафия, без смертей и алиби', () => {
    let g = setup(BASE);
    expect(g.state.nights[0]?.steps).toEqual(['meeting']);
    expectError(g, { type: 'NightChoose', target: id(7) }, 'night.meeting');
    g = proceed(g);
    const report = getMorningReport(g.state);
    expect(report?.meeting).toBe(true);
    expect(report?.deaths).toEqual([]);
    expect(report?.alibi).toBeNull();
    g = toDiscussion(g);
    expect(g.state.phase.t).toBe('discussion');
  });

  it('итог не зависит от того, что выбор меняли', () => {
    let g = setup(BASE, FULL);
    g = act(g, { type: 'NightChoose', target: id(7) });
    g = act(g, { type: 'NightChoose', target: id(8) });
    g = night(proceed(g), { mafia: 9 });
    expect(g.state.nights[0]?.choices.lover).toBe(id(8));
    expect(g.state.alibi?.playerId).toBe(id(8));
  });

  it('спасения объявляются только при announceSaves', () => {
    const quiet = night(setup(BASE, FULL), { mafia: 7, doctor: 7 });
    expect(getMorningReport(quiet.state)?.someoneSaved).toBe(false);
    const loud = night(setup(BASE, { ...FULL, announceSaves: true }), { mafia: 7, doctor: 7 });
    expect(getMorningReport(loud.state)?.someoneSaved).toBe(true);
  });
});
