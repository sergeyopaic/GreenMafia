// All host-facing texts (GAME_DESIGN.md §15) and labels.

import {
  type ActionStep,
  type GameResult,
  type NightStep,
  type Player,
  ROLE_NAME,
  type Role,
  type Settings,
  TEAM_NAME,
  type Team,
  type VerdictReason,
} from '@greenmafia/engine';

export { ROLE_NAME, TEAM_NAME };

export const seat = (p: Pick<Player, 'seat'>) => `№${p.seat}`;
export const who = (p: Pick<Player, 'seat' | 'name'>) => `№${p.seat}, ${p.name}`;
export const seats = (ps: Pick<Player, 'seat'>[]) => ps.map(seat).join(', ');

export const ROLE_SHORT: Record<Role, string> = {
  civilian: 'Мирный',
  mafia: 'Мафия',
  commissar: 'Комиссар',
  doctor: 'Доктор',
  lover: 'Любовница',
  maniac: 'Маньяк',
};

export const ROLE_PLURAL: Record<Role, string> = {
  civilian: 'мирных',
  mafia: 'мафии',
  commissar: 'комиссар',
  doctor: 'доктор',
  lover: 'любовница',
  maniac: 'маньяк',
};

export const ROLE_BLURB: Record<Role, string> = {
  civilian: 'Ночью спит. Днём ищет мафию и маньяка, выставляет и голосует.',
  mafia: 'Знает своих. Каждую ночь вместе с мафией выбирает одну жертву.',
  commissar: 'Каждую ночь проверяет одного игрока: мафия или нет.',
  doctor: 'Каждую ночь лечит одного игрока. Не одного и того же две ночи подряд.',
  lover: 'Просыпается первой. Её клиент ночью ничего не может, а днём у него алиби.',
  maniac: 'Одиночка. Каждую ночь убивает одного игрока. Побеждает последним.',
};

export const STEP_NAME: Record<NightStep, string> = {
  meeting: 'Знакомство',
  lover: 'Любовница',
  mafia: 'Мафия',
  maniac: 'Маньяк',
  doctor: 'Доктор',
  commissar: 'Комиссар',
};

export const SCRIPT = {
  nightStart: 'Город засыпает. Все закрывают глаза.',
  meetingWake: 'Просыпается мафия. Посмотрите друг на друга и запомните своих.',
  meetingSleep: 'Мафия засыпает.',
  wake: {
    lover: 'Просыпается любовница. К кому вы пойдёте этой ночью?',
    mafia: 'Просыпается мафия. Выберите жертву.',
    maniac: 'Просыпается маньяк. Кто не увидит рассвета?',
    doctor: 'Просыпается доктор. Кого вы спасёте этой ночью?',
    commissar: 'Просыпается комиссар. Кого вы проверите?',
  } satisfies Record<ActionStep, string>,
  sleep: {
    lover: 'Любовница засыпает.',
    mafia: 'Мафия сделала выбор и засыпает.',
    maniac: 'Маньяк засыпает.',
    doctor: 'Доктор засыпает.',
    commissar: 'Комиссар засыпает.',
  } satisfies Record<ActionStep, string>,
  morningStart: 'Город просыпается.',
  deathsNone: 'Этой ночью никто не погиб.',
  deathsOne: (p: Player) => `Этой ночью нас покинул игрок ${who(p)}.`,
  deathsMany: (ps: Player[]) => `Этой ночью нас покинули: ${ps.map(who).join('; ')}.`,
  alibi: (p: Player) => `У игрока ${seat(p)} сегодня алиби: его нельзя выставить.`,
  saved: 'Этой ночью кого-то спасли.',
  lastWord: (p: Player) => `Игрок ${seat(p)}, ваше последнее слово.`,
  speech: (p: Player) => `Слово игроку ${who(p)}.`,
  defense: (p: Player) => `Игрок ${seat(p)}, слово в свою защиту.`,
  voteStart: (ps: Player[]) => `Переходим к голосованию. Кандидаты: ${seats(ps)}.`,
  voteCandidate: (p: Player) => `Кто за то, чтобы игрок ${seat(p)} покинул город?`,
  voteTie: (ps: Player[]) => `Голоса разделились между ${seats(ps)}. Каждому — слово в защиту.`,
  voteAllOut: (ps: Player[]) => `Кто за то, чтобы все игроки — ${seats(ps)} — покинули город?`,
};

export function verdictText(reason: VerdictReason, out: Player[]): string {
  switch (reason) {
    case 'eliminated':
    case 'autoSingle':
      return out[0] ? `Город решил: игрок ${seat(out[0])} покидает игру.` : '';
    case 'allOut':
      return `Город решил: игроки ${seats(out)} покидают игру.`;
    case 'noCandidates':
      return 'Никто не выставлен. Голосования не будет.';
    case 'firstDayNoVoting':
      return 'В первый день голосования нет.';
    case 'firstDaySingle':
      return 'В первый день единственная кандидатура не голосуется.';
    case 'noVotes':
      return 'Никто не проголосовал. Никто не покидает игру.';
    case 'tieNobody':
    case 'allOutFailed':
      return 'Город не пришёл к решению. Никто не покидает игру.';
    case 'removalCancelled':
      return 'Сегодня игрока удалили — голосование не проводится.';
  }
}

export const RESULT_TITLE: Record<GameResult['winner'], string> = {
  town: 'Город победил',
  mafia: 'Мафия захватила город',
  maniac: 'В городе остался только маньяк',
  draw: 'Ничья',
  aborted: 'Игра прервана',
};

export const RESULT_LINE: Record<GameResult['reason'], string> = {
  allEvilDead: 'Мафия повержена, маньяка больше нет.',
  maniacLast: 'Маньяку больше некого бояться.',
  parity: 'Мафии стало столько же, сколько честных горожан.',
  mafiaMajority: 'У мафии большинство — исход предрешён.',
  allDead: 'В живых не осталось никого.',
  stalemate: 'Мафиози и маньяк остались один на один — оба обречены.',
  manual: 'Ведущий завершил игру.',
};

export const TEAM_OF_WINNER: Partial<Record<GameResult['winner'], Team>> = {
  town: 'town',
  mafia: 'mafia',
  maniac: 'maniac',
};

export const DEATH_CAUSE: Record<string, string> = {
  night: 'убит ночью',
  loverLink: 'погиб вместе с любовницей',
  vote: 'изгнан голосованием',
  removed: 'удалён ведущим',
  left: 'покинул игру',
};

// ---------- Settings metadata (§12) ----------

export type SettingPath = string;

export interface SettingMeta {
  path: SettingPath;
  label: string;
  hint?: string;
  kind: 'bool' | 'choice' | 'number';
  choices?: { value: unknown; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

export const SETTINGS_GROUPS: { title: string; items: SettingMeta[] }[] = [
  {
    title: 'Ночь',
    items: [
      {
        path: 'firstNight',
        label: 'Первая ночь',
        kind: 'choice',
        choices: [
          { value: 'meeting', label: 'Знакомство мафии' },
          { value: 'full', label: 'Сразу со всеми ролями' },
        ],
      },
      { path: 'openSetup', label: 'Состав ролей объявляется', kind: 'bool', hint: 'Если выключено, ведущий будит все роли, даже отсутствующие.' },
      { path: 'fakeWakes', label: 'Будить выбывшие роли', kind: 'bool', hint: 'Пауза, чтобы по таймингу никто не понял, что роли уже нет.' },
      { path: 'minWakeSeconds', label: 'Минимум на ночной шаг', kind: 'number', min: 0, max: 30, step: 1, unit: 'с' },
      { path: 'mafiaCanTargetMafia', label: 'Мафия может убить своего', kind: 'bool' },
    ],
  },
  {
    title: 'Роли',
    items: [
      {
        path: 'commissarManiacResult',
        label: 'Маньяк при проверке комиссаром',
        kind: 'choice',
        choices: [
          { value: 'notMafia', label: '«Не мафия»' },
          { value: 'mafia', label: '«Мафия»' },
        ],
      },
      {
        path: 'doctorSelfHealLimit',
        label: 'Доктор лечит себя',
        kind: 'choice',
        choices: [
          { value: 0, label: 'Никогда' },
          { value: 1, label: 'Один раз' },
          { value: null, label: 'Без лимита' },
        ],
      },
      { path: 'doctorRepeatTarget', label: 'Доктор может лечить одного и того же две ночи подряд', kind: 'bool' },
      { path: 'loverRepeatTarget', label: 'Любовница может ходить к одному и тому же две ночи подряд', kind: 'bool' },
      { path: 'loverAlibi', label: 'Клиент любовницы получает алиби на день', kind: 'bool' },
      { path: 'alibiClientCanVote', label: 'Клиент с алиби голосует', kind: 'bool' },
      { path: 'loverProtects', label: 'Визит любовницы защищает от убийства', kind: 'bool' },
      { path: 'loverDeathLink', label: 'Клиент погибает вместе с любовницей', kind: 'bool' },
    ],
  },
  {
    title: 'Объявления',
    items: [
      {
        path: 'revealRoleOnDeath',
        label: 'Роль выбывшего',
        kind: 'choice',
        choices: [
          { value: 'none', label: 'Скрыта' },
          { value: 'team', label: 'Только команда' },
          { value: 'full', label: 'Раскрыта' },
        ],
      },
      { path: 'announceSaves', label: 'Объявлять, что кого-то спасли', kind: 'bool' },
      { path: 'lastWordNight', label: 'Последнее слово убитым ночью', kind: 'bool' },
      { path: 'lastWordDay', label: 'Последнее слово изгнанным', kind: 'bool' },
    ],
  },
  {
    title: 'День и голосование',
    items: [
      {
        path: 'speakingOrder',
        label: 'Кто начинает день',
        kind: 'choice',
        choices: [
          { value: 'rotating', label: 'Следующий по кругу' },
          { value: 'fromFirst', label: 'Всегда первый живой' },
        ],
      },
      { path: 'selfNomination', label: 'Можно выставить себя', kind: 'bool' },
      { path: 'firstDayVoting', label: 'Голосование в первый день', kind: 'bool' },
      { path: 'firstDaySingleCandidateSafe', label: 'В первый день одного кандидата не голосуем', kind: 'bool' },
      { path: 'singleCandidateAutoEliminate', label: 'Единственный кандидат уходит без голосования', kind: 'bool', hint: 'Кроме первого дня.' },
      { path: 'abstainAllowed', label: 'Можно воздержаться', kind: 'bool', hint: 'Если нельзя, голоса молчащих уходят последнему кандидату.' },
      {
        path: 'tieRule',
        label: 'При ничьей',
        kind: 'choice',
        choices: [
          { value: 'sports', label: 'Попил, переголосование, подъём всех' },
          { value: 'revoteThenNobody', label: 'Одно переголосование' },
          { value: 'nobody', label: 'Никто не уходит' },
        ],
      },
      { path: 'removalCancelsVote', label: 'Удаление игрока днём отменяет голосование', kind: 'bool' },
    ],
  },
  {
    title: 'Прочее',
    items: [
      { path: 'earlyWinDetection', label: 'Объявлять предрешённый исход досрочно', kind: 'bool' },
      { path: 'fouls', label: 'Фолы', kind: 'bool', hint: '3-й фол — пропуск речи, 4-й — удаление.' },
    ],
  },
  {
    title: 'Таймеры',
    items: [
      { path: 'timers.speech', label: 'Речь', kind: 'number', min: 30, max: 120, step: 10, unit: 'с' },
      { path: 'timers.defense', label: 'Защитная речь', kind: 'number', min: 15, max: 60, step: 5, unit: 'с' },
      { path: 'timers.lastWord', label: 'Последнее слово', kind: 'number', min: 15, max: 120, step: 15, unit: 'с' },
    ],
  },
];

export function getSetting(s: Settings, path: SettingPath): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], s);
}

export function setSetting(s: Settings, path: SettingPath, value: unknown): Settings {
  const [a, b] = path.split('.') as [string, string | undefined];
  if (b) {
    return { ...s, [a]: { ...(s as unknown as Record<string, Record<string, unknown>>)[a], [b]: value } } as Settings;
  }
  return { ...s, [a]: value } as Settings;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
