import type { Role, Settings } from '@greenmafia/engine';

export interface RoleBrief {
  action: string;
  rules: string[];
  goal: string;
}

type Lang = 'ru' | 'en';

/** Player-facing information only: never accept the roster or secret night choices. */
export function roleBrief(role: Role, s: Settings, lang: Lang = 'ru'): RoleBrief {
  return lang === 'en' ? roleBriefEn(role, s) : roleBriefRu(role, s);
}

export function firstNightBrief(s: Settings, lang: Lang = 'ru'): string {
  if (lang === 'en') {
    return s.firstNight === 'meeting'
      ? 'The first night is only the meeting of the mafia and the Don. No night actions, no kills.'
      : 'The first night is a real one: every night role acts.';
  }
  return s.firstNight === 'meeting'
    ? 'Первая ночь — только знакомство мафии и дона. Ночных действий и убийств нет.'
    : 'Первая ночь боевая: все ночные роли делают ход.';
}

/** Heading before the goal in a brief. */
export const GOAL_LABEL: Record<Lang, string> = { ru: 'Ваша цель.', en: 'Your goal.' };

function roleBriefRu(role: Role, s: Settings): RoleBrief {
  const townGoal = 'Победите вместе с городом: устраните всю мафию и маньяка.';
  const skip = 'Можно пропустить ночной ход.';
  const blockedSkip = 'Если к вам пришла любовница, этой ночью вы не делаете ход.';
  const mafiaGoal = s.earlyWinDetection
    ? 'Устраните маньяка и сравняйтесь числом с городом. При живом маньяке побеждаете досрочно, если мафиози хотя бы на двоих больше горожан.'
    : 'Устраните маньяка и сравняйтесь числом с городом.';
  switch (role) {
    case 'civilian':
      return { action: 'Ночью спите. Днём обсуждайте подозрения, выставляйте кандидатов и голосуйте.', rules: [], goal: townGoal };
    case 'mafia':
      return {
        action: 'Ночью вместе с сообщниками выберите одну общую жертву.',
        rules: [
          s.mafiaCanTargetMafia ? 'Можно выбрать любого живого игрока, в том числе мафиози.' : 'Нельзя выбирать мафиози и дона.',
          'Если в игре есть дон, последнее слово в выборе жертвы за ним. Без дона: не договорились или решили не убивать — промах.',
        ],
        goal: mafiaGoal,
      };
    case 'don':
      return {
        action:
          'Вы глава мафии. Ночью вместе с мафией выбираете жертву — последнее слово за вами. Затем просыпаетесь отдельно и проверяете одного игрока: комиссар он или нет.',
        rules: [
          'Себя проверять нельзя. Повторная проверка разрешена.',
          'Если вы выбыли или к вам пришла любовница, жертву выбирают остальные мафиози.',
          'Если к вам пришла любовница, проверки этой ночью нет.',
          'Комиссар видит вас как «Мафия».',
          skip,
        ],
        goal: mafiaGoal,
      };
    case 'commissar':
      return {
        action: 'Ночью проверьте одного живого игрока. Ведущий покажет ответ.',
        rules: [
          'Себя проверять нельзя. Повторная проверка разрешена.',
          'Дон даёт ответ «Мафия».',
          `Маньяк даёт ответ «${s.commissarManiacResult === 'mafia' ? 'Мафия' : 'Не мафия'}».`,
          'Если к вам пришла любовница, проверки этой ночью нет — ответа не будет.',
          skip,
        ],
        goal: townGoal,
      };
    case 'doctor':
      return {
        action: 'Ночью выберите живого игрока: лечение защищает его от смерти этой ночью.',
        rules: [
          s.doctorRepeatTarget ? 'Одного игрока можно лечить несколько ночей подряд.' : 'Нельзя лечить одного игрока две ночи подряд.',
          s.doctorSelfHealLimit === null
            ? 'Самолечение не ограничено.'
            : s.doctorSelfHealLimit === 0
              ? 'Самолечение запрещено.'
              : `Самолечение — не более ${s.doctorSelfHealLimit} раз за игру.`,
          `${blockedSkip} Ограничения при этом не расходуются.`,
          skip,
        ],
        goal: townGoal,
      };
    case 'lover':
      return {
        action: 'Просыпаетесь первой. Выберите живого игрока: его ночное действие блокируется.',
        rules: [
          'Себя выбирать нельзя.',
          s.loverRepeatTarget ? 'Можно посещать одного игрока несколько ночей подряд.' : 'Нельзя посещать одного игрока две ночи подряд.',
          s.loverAlibi
            ? `Клиент получает дневное алиби: его нельзя выставить; ${s.alibiClientCanVote ? 'он может голосовать' : 'он не голосует'}.`
            : 'Дневного алиби нет.',
          s.loverProtects ? 'Визит также защищает клиента от ночной смерти.' : 'Визит не защищает клиента от ночной смерти.',
          ...(s.loverDeathLink
            ? [
                s.loverProtects
                  ? 'Связь со смертью включена, но защита визитом спасает клиента этой ночью.'
                  : 'Если вы погибнете ночью, клиент тоже погибнет, если его не спасёт доктор.',
              ]
            : []),
          skip,
        ],
        goal: townGoal,
      };
    case 'maniac':
      return {
        action: 'Ночью выберите одну жертву. Играете в одиночку, против города и мафии.',
        rules: ['Себя выбирать нельзя.', `Комиссар видит вас как «${s.commissarManiacResult === 'mafia' ? 'Мафия' : 'Не мафия'}».`, blockedSkip, skip],
        goal: 'Победите, когда мафии не останется, а в живых будете вы и не больше одного горожанина.',
      };
  }
}

function roleBriefEn(role: Role, s: Settings): RoleBrief {
  const townGoal = 'Win together with the town: eliminate all of the mafia and the Maniac.';
  const skip = 'You may skip your night turn.';
  const blockedSkip = 'If the Mistress visits you, you do not act that night.';
  const mafiaGoal = s.earlyWinDetection
    ? 'Get rid of the Maniac and equal the town in number. With the Maniac alive you win early if the mafia outnumbers the townsfolk by at least two.'
    : 'Get rid of the Maniac and equal the town in number.';
  const maniacAnswer = s.commissarManiacResult === 'mafia' ? '“Mafia”' : '“Not mafia”';
  switch (role) {
    case 'civilian':
      return { action: 'Sleep at night. During the day discuss your suspicions, nominate candidates and vote.', rules: [], goal: townGoal };
    case 'mafia':
      return {
        action: 'At night choose one shared victim together with your accomplices.',
        rules: [
          s.mafiaCanTargetMafia ? 'You may choose any living player, mafiosi included.' : 'You cannot choose mafiosi or the Don.',
          'If there is a Don in the game, he has the final word on the victim. Without a Don: if you do not agree or decide not to kill, it is a miss.',
        ],
        goal: mafiaGoal,
      };
    case 'don':
      return {
        action:
          'You are the head of the mafia. At night you choose the victim together with the mafia — you have the final word. Then you wake up separately and check one player: is he the Commissar?',
        rules: [
          'You cannot check yourself. Repeat checks are allowed.',
          'If you are out or the Mistress visits you, the other mafiosi choose the victim.',
          'If the Mistress visits you, there is no check that night.',
          'The Commissar sees you as “Mafia”.',
          skip,
        ],
        goal: mafiaGoal,
      };
    case 'commissar':
      return {
        action: 'At night check one living player. The host will show you the answer.',
        rules: [
          'You cannot check yourself. Repeat checks are allowed.',
          'The Don gives the answer “Mafia”.',
          `The Maniac gives the answer ${maniacAnswer}.`,
          'If the Mistress visits you, there is no check that night — no answer.',
          skip,
        ],
        goal: townGoal,
      };
    case 'doctor':
      return {
        action: 'At night choose a living player: healing protects them from death that night.',
        rules: [
          s.doctorRepeatTarget ? 'You may heal the same player several nights in a row.' : 'You cannot heal the same player two nights in a row.',
          s.doctorSelfHealLimit === null
            ? 'Self-healing is unlimited.'
            : s.doctorSelfHealLimit === 0
              ? 'Self-healing is not allowed.'
              : `Self-healing — at most ${s.doctorSelfHealLimit} ${s.doctorSelfHealLimit === 1 ? 'time' : 'times'} per game.`,
          `${blockedSkip} Your restrictions are not used up.`,
          skip,
        ],
        goal: townGoal,
      };
    case 'lover':
      return {
        action: 'You wake up first. Choose a living player: their night action is blocked.',
        rules: [
          'You cannot choose yourself.',
          s.loverRepeatTarget ? 'You may visit the same player several nights in a row.' : 'You cannot visit the same player two nights in a row.',
          s.loverAlibi
            ? `The client gets a day alibi: they cannot be nominated; ${s.alibiClientCanVote ? 'they can vote' : 'they do not vote'}.`
            : 'There is no day alibi.',
          s.loverProtects ? 'The visit also protects the client from death at night.' : 'The visit does not protect the client from death at night.',
          ...(s.loverDeathLink
            ? [
                s.loverProtects
                  ? 'Linked death is on, but the protection of the visit saves the client that night.'
                  : 'If you die at night, your client dies too, unless the Doctor saves them.',
              ]
            : []),
          skip,
        ],
        goal: townGoal,
      };
    case 'maniac':
      return {
        action: 'At night choose one victim. You play alone, against both the town and the mafia.',
        rules: ['You cannot choose yourself.', `The Commissar sees you as ${maniacAnswer}.`, blockedSkip, skip],
        goal: 'You win when the mafia is gone and only you and at most one townsperson are left alive.',
      };
  }
}
