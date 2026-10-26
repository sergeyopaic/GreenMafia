// Game settings. See GAME_DESIGN.md §12.

export interface Settings {
  firstNight: 'meeting' | 'full';
  openSetup: boolean;
  fakeWakes: boolean;
  /** UI-only: minimum duration of a night step, seconds. */
  minWakeSeconds: number;
  mafiaCanTargetMafia: boolean;
  commissarManiacResult: 'notMafia' | 'mafia';
  /** `null` = unlimited. */
  doctorSelfHealLimit: number | null;
  doctorRepeatTarget: boolean;
  loverRepeatTarget: boolean;
  loverAlibi: boolean;
  alibiClientCanVote: boolean;
  loverProtects: boolean;
  loverDeathLink: boolean;
  announceSaves: boolean;
  revealRoleOnDeath: 'none' | 'team' | 'full';
  lastWordNight: boolean;
  lastWordDay: boolean;
  speakingOrder: 'rotating' | 'fromFirst';
  selfNomination: boolean;
  firstDayVoting: boolean;
  firstDaySingleCandidateSafe: boolean;
  singleCandidateAutoEliminate: boolean;
  abstainAllowed: boolean;
  tieRule: 'sports' | 'revoteThenNobody' | 'nobody';
  earlyWinDetection: boolean;
  fouls: boolean;
  removalCancelsVote: boolean;
  /** UI-only, seconds. */
  timers: { speech: number; defense: number; lastWord: number };
}

export const CLASSIC_SETTINGS: Settings = {
  firstNight: 'meeting',
  openSetup: true,
  fakeWakes: true,
  minWakeSeconds: 10,
  mafiaCanTargetMafia: false,
  commissarManiacResult: 'notMafia',
  doctorSelfHealLimit: 1,
  doctorRepeatTarget: false,
  loverRepeatTarget: false,
  loverAlibi: true,
  alibiClientCanVote: true,
  loverProtects: false,
  loverDeathLink: true,
  announceSaves: false,
  revealRoleOnDeath: 'none',
  lastWordNight: false,
  lastWordDay: true,
  speakingOrder: 'rotating',
  selfNomination: false,
  firstDayVoting: true,
  firstDaySingleCandidateSafe: true,
  singleCandidateAutoEliminate: false,
  abstainAllowed: true,
  tieRule: 'sports',
  earlyWinDetection: true,
  fouls: false,
  removalCancelsVote: false,
  timers: { speech: 60, defense: 30, lastWord: 60 },
};

export const SPORTS_SETTINGS: Settings = {
  ...CLASSIC_SETTINGS,
  abstainAllowed: false,
  singleCandidateAutoEliminate: true,
  fouls: true,
  removalCancelsVote: true,
  lastWordNight: true,
  revealRoleOnDeath: 'none',
};

export const PRESETS = {
  classic: CLASSIC_SETTINGS,
  sports: SPORTS_SETTINGS,
} as const;

export type PresetName = keyof typeof PRESETS;

/** Fill missing keys with classic defaults (e.g. a game saved by an older version). */
export function withDefaults(partial: Partial<Settings>): Settings {
  return {
    ...CLASSIC_SETTINGS,
    ...partial,
    timers: { ...CLASSIC_SETTINGS.timers, ...(partial.timers ?? {}) },
  };
}
