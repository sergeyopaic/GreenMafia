import {
  type CreateGameEvent,
  type Game,
  type GameEvent,
  canUndo,
  dispatch as engineDispatch,
  newGame,
  replayTolerant,
  undo as engineUndo,
} from '@greenmafia/engine';
import { create } from 'zustand';
import { type Lang, detectLang, dictFor, errorText } from './i18n/dicts';
import { setSoundContext, setSoundEnabled } from './lib/sound';
import {
  type SavedGame,
  clearCurrent,
  loadCurrent,
  loadPrefs,
  removeHistory,
  saveCurrent,
  savePrefs,
  upsertHistory,
} from './lib/storage';

export type Screen =
  | { name: 'home' }
  | { name: 'setup' }
  | { name: 'game' }
  | { name: 'history' }
  | { name: 'archive'; game: SavedGame; back?: Screen }
  | { name: 'rules' }
  | { name: 'players' }
  | { name: 'profile'; id: string };

interface Toast {
  id: number;
  text: string;
}

interface AppState {
  ready: boolean;
  screen: Screen;
  gameId: string | null;
  createdAt: number;
  game: Game | null;
  /** Unfinished game found in storage. */
  resumable: SavedGame | null;
  toast: Toast | null;
  paused: boolean;
  /** The phone has been handed back to the host after the deal. */
  handBackAck: boolean;
  sound: boolean;
  lang: Lang;

  init(): Promise<void>;
  go(screen: Screen): void;
  startGame(event: CreateGameEvent): boolean;
  resume(): void;
  dispatch(event: GameEvent): boolean;
  undo(): void;
  canUndo(): boolean;
  /** Leave the current game (finished or abandoned). */
  closeGame(): void;
  showToast(text: string): void;
  setPaused(p: boolean): void;
  ackHandBack(): void;
  toggleSound(): void;
  setLang(lang: Lang): void;
}

let toastSeq = 0;
let lastProceedAt = -Infinity;
const PROCEED_GUARD_MS = 450;

function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Cryptographically random seed for dealing roles (§5.3). */
export function randomSeed(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function persist(id: string, createdAt: number, game: Game): void {
  const saved: SavedGame = { id, createdAt, events: game.events };
  if (game.state.phase.t === 'gameOver') {
    saved.finishedAt = Date.now();
    void upsertHistory(saved);
  } else {
    void removeHistory(id);
  }
  void saveCurrent(saved);
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  screen: { name: 'home' },
  gameId: null,
  createdAt: 0,
  game: null,
  resumable: null,
  toast: null,
  paused: false,
  handBackAck: false,
  sound: true,
  lang: detectLang(),

  async init() {
    const [current, prefs] = await Promise.all([loadCurrent(), loadPrefs()]);
    setSoundEnabled(prefs.sound);
    let resumable: SavedGame | null = null;
    if (current) {
      // Tolerant: a log from an older version keeps everything up to the first invalid action.
      const r = replayTolerant(current.events);
      if (r.game && r.game.state.phase.t !== 'gameOver') resumable = current;
    }
    const lang = prefs.lang ?? detectLang();
    set({ ready: true, resumable, sound: prefs.sound, lang });
  },

  go(screen) {
    set({ screen, paused: false });
    window.scrollTo(0, 0);
  },

  startGame(event) {
    const r = newGame(event);
    if (!r.ok) {
      get().showToast(errorText(dictFor(get().lang), r.error));
      return false;
    }
    const id = newId();
    const createdAt = Date.now();
    set({
      game: r.value,
      gameId: id,
      createdAt,
      screen: { name: 'game' },
      resumable: null,
      paused: false,
      handBackAck: event.dealing === 'cards',
    });
    persist(id, createdAt, r.value);
    return true;
  },

  resume() {
    const saved = get().resumable;
    if (!saved) return;
    const r = replayTolerant(saved.events);
    if (!r.game) {
      const t = dictFor(get().lang);
      get().showToast(t.store.restoreFailed(r.error ? errorText(t, r.error) : t.store.logBroken));
      void clearCurrent();
      set({ resumable: null });
      return;
    }
    const game = r.game;
    if (r.dropped > 0) {
      get().showToast(dictFor(get().lang).store.dropped(r.dropped));
      persist(saved.id, saved.createdAt, game);
    }
    set({
      game,
      gameId: saved.id,
      createdAt: saved.createdAt,
      screen: { name: 'game' },
      resumable: null,
      // Resumed in the middle of the deal: the phone still has to come back to the host.
      handBackAck: game.state.phase.t !== 'reveal',
      paused: false,
    });
  },

  dispatch(event) {
    const { game, gameId, createdAt } = get();
    if (!game || !gameId) return false;
    // A double tap must not skip a screen: the next "Next" button appears under the same finger.
    if (event.type === 'Proceed') {
      const now = performance.now();
      if (now - lastProceedAt < PROCEED_GUARD_MS) return false;
      lastProceedAt = now;
    }
    const r = engineDispatch(game, event);
    if (!r.ok) {
      get().showToast(errorText(dictFor(get().lang), r.error));
      return false;
    }
    set({ game: r.value });
    persist(gameId, createdAt, r.value);
    return true;
  },

  undo() {
    const { game, gameId, createdAt } = get();
    if (!game || !gameId || !canUndo(game)) return;
    const prev = engineUndo(game);
    set({ game: prev });
    persist(gameId, createdAt, prev);
  },

  canUndo() {
    const g = get().game;
    return !!g && canUndo(g);
  },

  closeGame() {
    const { game } = get();
    if (game && game.state.phase.t !== 'gameOver') {
      // Abandoned: keep it resumable.
      const { gameId, createdAt } = get();
      if (gameId) set({ resumable: { id: gameId, createdAt, events: game.events } });
    } else {
      void clearCurrent();
      set({ resumable: null });
    }
    set({ game: null, gameId: null, screen: { name: 'home' }, paused: false });
  },

  showToast(text) {
    const id = ++toastSeq;
    set({ toast: { id, text } });
    setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null });
    }, 3200);
  },

  setPaused(paused) {
    set({ paused });
  },

  ackHandBack() {
    set({ handBackAck: true });
  },

  toggleSound() {
    const sound = !get().sound;
    setSoundEnabled(sound);
    void savePrefs({ sound, lang: get().lang });
    set({ sound });
  },

  setLang(lang) {
    void savePrefs({ sound: get().sound, lang });
    set({ lang });
  },
}));

useApp.subscribe((state) => {
  setSoundContext(state.screen.name === 'game' ? state.game?.state.phase.t ?? null : null, state.paused);
});

/** The current game state; only call inside the game screens. */
export function useGame() {
  const game = useApp((s) => s.game);
  if (!game) throw new Error('No active game');
  return game.state;
}

// Dev-only handle for testing in the browser console.
if (import.meta.env.DEV) (window as unknown as { __gm: typeof useApp }).__gm = useApp;
