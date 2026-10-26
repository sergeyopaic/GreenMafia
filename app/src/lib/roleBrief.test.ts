import { describe, expect, it } from 'vitest';
import { CLASSIC_SETTINGS } from '@greenmafia/engine';
import { firstNightBrief, roleBrief } from './roleBrief';

describe('памятки отражают настройки партии', () => {
  it('объясняет лимит самолечения и правило повторного лечения', () => {
    expect(roleBrief('doctor', CLASSIC_SETTINGS).rules.join(' ')).toContain('не более 1 раз');
    const custom = { ...CLASSIC_SETTINGS, doctorSelfHealLimit: null, doctorRepeatTarget: true };
    expect(roleBrief('doctor', custom).rules.join(' ')).toContain('Самолечение не ограничено');
    expect(roleBrief('doctor', custom).rules.join(' ')).toContain('несколько ночей подряд');
    expect(roleBrief('doctor', { ...custom, doctorSelfHealLimit: 0 }).rules).toContain('Самолечение запрещено.');
  });
  it('не обещает алиби, защиту и возможность голосовать при выключенных настройках', () => {
    const rules = roleBrief('lover', { ...CLASSIC_SETTINGS, loverAlibi: false, loverProtects: true, loverDeathLink: true }).rules.join(' ');
    expect(rules).toContain('Дневного алиби нет');
    expect(rules).toContain('защищает клиента');
    expect(rules).toContain('защита визитом спасает клиента');
    expect(roleBrief('lover', { ...CLASSIC_SETTINGS, loverDeathLink: true }).rules.join(' ')).toContain('клиент тоже погибнет');
    expect(roleBrief('lover', { ...CLASSIC_SETTINGS, alibiClientCanVote: false }).rules.join(' ')).toContain('он не голосует');
  });
  it('показывает одинаковую трактовку маньяка обеим ролям', () => {
    for (const result of ['mafia', 'notMafia'] as const) {
      const settings = { ...CLASSIC_SETTINGS, commissarManiacResult: result };
      const answer = result === 'mafia' ? '«Мафия»' : '«Не мафия»';
      expect(roleBrief('commissar', settings).rules.join(' ')).toContain(answer);
      expect(roleBrief('maniac', settings).rules.join(' ')).toContain(answer);
    }
  });
  it('объясняет роль дона и пропуск хода при блоке', () => {
    const don = roleBrief('don', CLASSIC_SETTINGS);
    expect(don.action).toContain('последнее слово за вами');
    expect(don.action).toContain('комиссар он или нет');
    expect(roleBrief('commissar', CLASSIC_SETTINGS).rules).toContain('Дон даёт ответ «Мафия».');
    expect(roleBrief('doctor', CLASSIC_SETTINGS).rules.join(' ')).toContain('не расходуются');
  });
  it('объясняет боевую ночь и отключение досрочной победы', () => {
    expect(firstNightBrief(CLASSIC_SETTINGS)).toContain('только знакомство');
    expect(firstNightBrief({ ...CLASSIC_SETTINGS, firstNight: 'full' })).toContain('боевая');
    expect(roleBrief('mafia', { ...CLASSIC_SETTINGS, earlyWinDetection: false }).goal).not.toContain('досрочно');
  });
});
