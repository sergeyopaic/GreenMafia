import type { GameState } from '@greenmafia/engine';
import type { Dict } from '../i18n/dicts';

export type Theme = 'night' | 'day';

export function themeOf(state: GameState | null): Theme {
  if (!state) return 'night';
  const t = state.phase.t;
  return t === 'reveal' || t === 'night' ? 'night' : 'day';
}

export function phaseTitle(state: GameState, t: Dict): { title: string; sub: string } {
  const ph = state.phase;
  const p = t.phase;
  switch (ph.t) {
    case 'reveal':
      return { title: p.deal, sub: p.dealSub(ph.index + 1, state.players.length) };
    case 'night': {
      const step = state.nights[state.nights.length - 1]?.steps[ph.stepIndex];
      return { title: p.night(ph.number), sub: step ? t.steps[step] : '' };
    }
    case 'morning':
      return { title: p.day(ph.number), sub: p.morning };
    case 'lastWords':
      return { title: p.day(ph.number), sub: p.lastWord };
    case 'discussion':
      return { title: p.day(ph.number), sub: p.discussion };
    case 'voting':
      return {
        title: p.day(ph.number),
        sub: ph.kind === 'main' ? p.voting : ph.kind === 'revote' ? p.revote : p.allOut,
      };
    case 'defense':
      return { title: p.day(ph.number), sub: p.defense };
    case 'verdict':
      return { title: p.day(ph.number), sub: p.verdict };
    case 'gameOver':
      return { title: p.over, sub: p.overSub };
  }
}
