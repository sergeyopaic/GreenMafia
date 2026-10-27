// Language-independent helpers around texts. The texts themselves live in src/i18n (ru.ts, en.ts).

import type { Settings } from '@greenmafia/engine';
import type { Dict } from '../i18n/dicts';

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

type Def = Omit<SettingMeta, 'label' | 'hint' | 'choices' | 'unit'> & { choices?: unknown[]; seconds?: boolean };

const GROUPS: { key: keyof Dict['settings']['groups']; items: Def[] }[] = [
  {
    key: 'night',
    items: [
      { path: 'firstNight', kind: 'choice', choices: ['meeting', 'full'] },
      { path: 'openSetup', kind: 'bool' },
      { path: 'fakeWakes', kind: 'bool' },
      { path: 'minWakeSeconds', kind: 'number', min: 0, max: 30, step: 1, seconds: true },
      { path: 'mafiaCanTargetMafia', kind: 'bool' },
    ],
  },
  {
    key: 'roles',
    items: [
      { path: 'commissarManiacResult', kind: 'choice', choices: ['notMafia', 'mafia'] },
      { path: 'doctorSelfHealLimit', kind: 'choice', choices: [0, 1, null] },
      { path: 'doctorRepeatTarget', kind: 'bool' },
      { path: 'loverRepeatTarget', kind: 'bool' },
      { path: 'loverAlibi', kind: 'bool' },
      { path: 'alibiClientCanVote', kind: 'bool' },
      { path: 'loverProtects', kind: 'bool' },
      { path: 'loverDeathLink', kind: 'bool' },
    ],
  },
  {
    key: 'announce',
    items: [
      { path: 'revealRoleOnDeath', kind: 'choice', choices: ['none', 'team', 'full'] },
      { path: 'announceSaves', kind: 'bool' },
      { path: 'lastWordNight', kind: 'bool' },
      { path: 'lastWordDay', kind: 'bool' },
    ],
  },
  {
    key: 'day',
    items: [
      { path: 'speakingOrder', kind: 'choice', choices: ['rotating', 'fromFirst'] },
      { path: 'selfNomination', kind: 'bool' },
      { path: 'firstDayVoting', kind: 'bool' },
      { path: 'firstDaySingleCandidateSafe', kind: 'bool' },
      { path: 'singleCandidateAutoEliminate', kind: 'bool' },
      { path: 'abstainAllowed', kind: 'bool' },
      { path: 'tieRule', kind: 'choice', choices: ['sports', 'revoteThenNobody', 'nobody'] },
      { path: 'removalCancelsVote', kind: 'bool' },
    ],
  },
  {
    key: 'other',
    items: [
      { path: 'earlyWinDetection', kind: 'bool' },
      { path: 'fouls', kind: 'bool' },
    ],
  },
  {
    key: 'timers',
    items: [
      { path: 'timers.speech', kind: 'number', min: 30, max: 120, step: 10, seconds: true },
      { path: 'timers.defense', kind: 'number', min: 15, max: 60, step: 5, seconds: true },
      { path: 'timers.lastWord', kind: 'number', min: 15, max: 120, step: 15, seconds: true },
    ],
  },
];

/** Settings grouped for the setup screen, labelled in the given language. */
export function settingsGroups(t: Dict): { title: string; items: SettingMeta[] }[] {
  const s = t.settings;
  return GROUPS.map((g) => ({
    title: s.groups[g.key],
    items: g.items.map(({ choices, seconds, ...def }) => {
      const meta: SettingMeta = { ...def, label: s.labels[def.path] ?? def.path };
      const hint = s.hints[def.path];
      if (hint) meta.hint = hint;
      if (seconds) meta.unit = t.common.sec;
      if (choices) {
        meta.choices = choices.map((value) => ({ value, label: s.choices[def.path]?.[String(value)] ?? String(value) }));
      }
      return meta;
    }),
  }));
}

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
