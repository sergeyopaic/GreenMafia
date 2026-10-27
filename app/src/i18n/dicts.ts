// Dictionaries and translation helpers (no store dependency: the store imports this file).

import type { CompositionIssue, EngineError, Reason } from '@greenmafia/engine';
import { en } from './en';
import { type Dict, ru } from './ru';

export type { Dict, Seat } from './ru';
export type Lang = 'ru' | 'en';

export const DICTS: Record<Lang, Dict> = { ru, en };
export const LANGS: Lang[] = ['ru', 'en'];

/** Default language: Russian for Russian-speaking browsers, English for everyone else. */
export function detectLang(): Lang {
  const langs = typeof navigator !== 'undefined' ? [navigator.language, ...(navigator.languages ?? [])] : [];
  return langs.some((l) => l?.toLowerCase().startsWith('ru')) ? 'ru' : 'en';
}

export function dictFor(lang: Lang): Dict {
  return DICTS[lang] ?? ru;
}

type Params = Record<string, string | number>;

/** Text of an engine error in the current language (Russian falls back to the engine's own message). */
export function errorText(t: Dict, e: EngineError): string {
  const params: Params = e.params ?? {};
  const reason = params.reason;
  if (typeof reason === 'string' && t.reasons[reason]) return t.reasons[reason](params);
  const f = t.errors[e.code];
  return f ? f(params) : e.message;
}

/** Text of a reason (invalid target, invalid nomination). */
export function reasonText(t: Dict, r: Reason | null | undefined): string {
  if (!r) return '';
  const f = t.reasons[r.code];
  return f ? f(r.params ?? {}) : r.message;
}

/** Text of a composition validation issue. */
export function issueText(t: Dict, i: CompositionIssue): string {
  const f = t.composition[i.code];
  return f ? f(i.params ?? {}) : i.message;
}
