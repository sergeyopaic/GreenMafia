import type { GameState } from '@greenmafia/engine';
import { STEP_NAME } from './text';

export type Theme = 'night' | 'day';

export function themeOf(state: GameState | null): Theme {
  if (!state) return 'night';
  const t = state.phase.t;
  return t === 'reveal' || t === 'night' ? 'night' : 'day';
}

export function phaseTitle(state: GameState): { title: string; sub: string } {
  const ph = state.phase;
  switch (ph.t) {
    case 'reveal':
      return { title: 'Раздача', sub: `роль ${ph.index + 1} из ${state.players.length}` };
    case 'night': {
      const step = state.nights[state.nights.length - 1]?.steps[ph.stepIndex];
      return { title: `Ночь ${ph.number}`, sub: step ? STEP_NAME[step] : '' };
    }
    case 'morning':
      return { title: `День ${ph.number}`, sub: 'утро' };
    case 'lastWords':
      return { title: `День ${ph.number}`, sub: 'последнее слово' };
    case 'discussion':
      return { title: `День ${ph.number}`, sub: 'обсуждение' };
    case 'voting':
      return {
        title: `День ${ph.number}`,
        sub: ph.kind === 'main' ? 'голосование' : ph.kind === 'revote' ? 'переголосование' : 'подъём всех',
      };
    case 'defense':
      return { title: `День ${ph.number}`, sub: 'защитная речь' };
    case 'verdict':
      return { title: `День ${ph.number}`, sub: 'итог дня' };
    case 'gameOver':
      return { title: 'Дело закрыто', sub: 'финал' };
  }
}
