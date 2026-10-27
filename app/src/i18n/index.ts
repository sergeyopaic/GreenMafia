// Language switching: the current dictionary comes from the store, so every screen re-renders on change.

import { useApp } from '../store';
import { type Dict, dictFor } from './dicts';

export * from './dicts';

/** The dictionary for the current language (re-renders on change). */
export function useT(): Dict {
  return dictFor(useApp((s) => s.lang));
}

/** The dictionary outside React components. */
export function getT(): Dict {
  return dictFor(useApp.getState().lang);
}

