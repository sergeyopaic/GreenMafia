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
import { setSoundContext, setSoundEnabled, setVibrationEnabled } from './lib/sound';
import { pauseRuntime, runtimeFor, timerRemaining, type GameRuntime, type VotingDraft } from './lib/gameRuntime';
import { inspectGame } from './lib/saveFormat';
import { backupGame, type GameBackup } from './lib/backups';
import { useStorageHealth, sealStorageWrites } from './lib/persistence';
import {
  type SavedGame,
  type LastSetup,
  loadCurrent,
  loadPrefs,
  saveGame,
  savePrefs,
  saveLastSetup,
} from './lib/storage';
import { savePlayers, type PlayerProfile } from './lib/players';
import { DEFAULT_KEEP_AWAKE, type KeepAwake } from './lib/wakeLock';
import { mayWrite } from './lib/tabOwnership';
import { commitImport, commitClear } from './lib/importData';
import { ImportError, type ImportPlan } from './lib/deviceFormat';

interface GameStartData { setup: LastSetup; profiles: PlayerProfile[] }
export type SecretKind = 'role' | 'peek' | 'answer';
const closedSecrets = () => ({ role: false, peek: false, answer: false });

export type Screen =
  | { name: 'home' }
  | { name: 'welcome' }
  | { name: 'setup' }
  | { name: 'game' }
  | { name: 'history' }
  | { name: 'backups'; back?: 'settings' | 'history' }
  | { name: 'settings' }
  | { name: 'privacy' }
  | { name: 'licenses' }
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
  currentRecovery: { original: unknown; kind: 'partial' | 'migration' | 'invalid' | 'future'; dropped: number } | null;
  pendingStart: { event: CreateGameEvent; data?: GameStartData } | null;
  dataBusy: boolean;
  importing: boolean;
  importComplete: boolean;
  dataOperation: 'import' | 'history' | 'all';
  secrets: Record<SecretKind, boolean>;
  privacyCovered: boolean;
  privacyEpoch: number;
  crashed: boolean;
  recoveryEpoch: number;
  toast: Toast | null;
  paused: boolean;
  runtime: GameRuntime | null;
  /** The phone has been handed back to the host after the deal. */
  handBackAck: boolean;
  sound: boolean;
  vibration: boolean;
  lang: Lang;
  introSeen: boolean;
  /** When the screen stays on: during a game (default), always, or never. */
  keepAwake: KeepAwake;

  init(): Promise<void>;
  go(screen: Screen): void;
  startGame(event: CreateGameEvent, data?: GameStartData): boolean;
  confirmStart(): Promise<boolean>;
  cancelStart(): void;
  resume(): Promise<boolean>;
  restoreBackup(backup: GameBackup): Promise<boolean>;
  dispatch(event: GameEvent): boolean;
  undo(): void;
  canUndo(): boolean;
  /** Leave the current game (finished or abandoned). */
  closeGame(): void;
  showToast(text: string): void;
  setPaused(p: boolean): void;
  setSecret(kind: SecretKind, open: boolean): void;
  suspend(): void;
  uncover(): void;
  updateVotingDraft(update: (draft: VotingDraft) => VotingDraft): void;
  toggleTimer(): void;
  resetTimer(): void;
  finishTimer(): void;
  ackHandBack(): void;
  toggleSound(): void;
  toggleVibration(): void;
  setKeepAwake(mode: KeepAwake): void;
  setLang(lang: Lang): void;
  finishIntro(destination: 'home' | 'setup'): void;
  importFile(plan: ImportPlan): Promise<void>;
  clearData(scope: 'history' | 'all'): Promise<void>;
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
  const runtime = runtimeFor(game.state, useApp.getState().runtime);
  const saved: SavedGame = { schemaVersion: 1, id, createdAt, events: game.events, runtime };
  if (game.state.phase.t === 'gameOver') {
    saved.finishedAt = Date.now();
  }
  void saveGame(saved);
}

function checkpoint(): void {
  const { game, gameId, createdAt } = useApp.getState();
  if (game && gameId) persist(gameId, createdAt, game);
}

function mayInteract(): boolean { return mayWrite() && !useApp.getState().crashed && !useApp.getState().importing; }

function persistPrefs(): void {
  const { sound, vibration, lang, introSeen, keepAwake } = useApp.getState();
  void savePrefs({ sound, vibration, lang, introSeen, keepAwake });
}

function currentSnapshot(): unknown {
  const state = useApp.getState();
  if (state.game && state.gameId) {
    const saved: SavedGame = { schemaVersion: 1, id: state.gameId, createdAt: state.createdAt, events: state.game.events,
      runtime: pauseRuntime(runtimeFor(state.game.state, state.runtime), true) };
    if (state.game.state.phase.t === 'gameOver') saved.finishedAt = Date.now();
    return saved;
  }
  if (state.currentRecovery) return state.currentRecovery.original;
  return state.resumable ?? undefined;
}

function openSaved(saved: SavedGame, game: Game): void {
  const runtime = runtimeFor(game.state, saved.runtime, true);
  useApp.setState({ game, runtime, gameId: saved.id, createdAt: saved.createdAt, screen: { name: 'game' }, resumable: null,
    currentRecovery: null, pendingStart: null, secrets: closedSecrets(), handBackAck: game.state.phase.t !== 'reveal', paused: true });
  lastProceedAt = -Infinity;
  checkpoint();
}

function activateGame(event: CreateGameEvent, game: Game, data?: GameStartData): void {
  const id = newId();
  const createdAt = Date.now();
  const paused = useApp.getState().privacyCovered;
  useApp.setState({ game, gameId: id, createdAt, screen: { name: 'game' }, resumable: null, currentRecovery: null,
    pendingStart: null, secrets: closedSecrets(), paused, runtime: pauseRuntime(runtimeFor(game.state), paused), handBackAck: event.dealing === 'cards' });
  lastProceedAt = -Infinity;
  persist(id, createdAt, game);
  if (data) {
    void saveLastSetup(data.setup);
    void savePlayers(data.profiles);
  }
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  screen: { name: 'home' },
  gameId: null,
  createdAt: 0,
  game: null,
  resumable: null,
  currentRecovery: null,
  pendingStart: null,
  dataBusy: false,
  importing: false,
  importComplete: false,
  dataOperation: 'import',
  secrets: closedSecrets(),
  privacyCovered: false,
  privacyEpoch: 0,
  crashed: false,
  recoveryEpoch: 0,
  toast: null,
  paused: false,
  runtime: null,
  handBackAck: false,
  sound: true,
  vibration: true,
  lang: detectLang(),
  introSeen: false,
  keepAwake: DEFAULT_KEEP_AWAKE,

  async init() {
    if (get().ready || get().crashed) return;
    const epoch = get().recoveryEpoch;
    const [current, prefs] = await Promise.all([loadCurrent(), loadPrefs()]);
    if (get().crashed || get().recoveryEpoch !== epoch) return;
    setSoundEnabled(prefs.sound);
    const vibration = prefs.vibration ?? prefs.sound;
    setVibrationEnabled(vibration);
    const inspected = inspectGame(current);
    const resumable = inspected.kind === 'ready' && (inspected.game.state.phase.t !== 'gameOver' || inspected.dropped > 0) ? inspected.saved : null;
    const currentRecovery: AppState['currentRecovery'] = inspected.kind === 'invalid' || inspected.kind === 'future'
      ? { original: current, kind: inspected.kind, dropped: 0 }
      : inspected.kind === 'ready' && resumable && (inspected.dropped > 0 || inspected.migrated)
        ? { original: current, kind: inspected.dropped ? 'partial' : 'migration', dropped: inspected.dropped } : null;
    const lang = prefs.lang ?? detectLang();
    const introSeen = prefs.introSeen ?? false;
    const keepAwake = prefs.keepAwake ?? DEFAULT_KEEP_AWAKE;
    // Recovery always takes priority over introducing the app.
    const welcome = !introSeen && inspected.kind === 'missing' && !get().game && get().screen.name === 'home';
    set({ ready: true, resumable, currentRecovery, sound: prefs.sound, vibration, lang, introSeen, keepAwake,
      ...(welcome ? { screen: { name: 'welcome' } } : {}) });
  },

  go(screen) {
    if (get().crashed || get().importing) return;
    if (get().game && screen.name !== 'game') get().setPaused(true);
    set({ screen, paused: get().runtime?.paused ?? false });
    window.scrollTo(0, 0);
  },

  startGame(event, data) {
    if (!mayInteract() || get().dataBusy || useStorageHealth.getState().readErrors.length) return false;
    const r = newGame(event);
    if (!r.ok) {
      get().showToast(errorText(dictFor(get().lang), r.error));
      return false;
    }
    if (get().resumable || get().currentRecovery || (get().game && get().game!.state.phase.t !== 'gameOver')) {
      set({ pendingStart: structuredClone({ event, data }) });
      return false;
    }
    activateGame(event, r.value, data);
    return true;
  },

  async confirmStart() {
    const pending = get().pendingStart;
    if (!mayInteract() || !pending || get().dataBusy || useStorageHealth.getState().readErrors.length) return false;
    const epoch = get().recoveryEpoch;
    const { event, data } = pending;
    const next = newGame(event);
    if (!next.ok) return false;
    set({ dataBusy: true });
    try {
      const original = currentSnapshot();
      if (original !== undefined && !await backupGame(original, 'replacement')) {
        get().showToast(dictFor(get().lang).recovery.backupFailed);
        return false;
      }
      if (!mayInteract() || get().recoveryEpoch !== epoch) return false;
      activateGame(event, next.value, data);
      return true;
    } finally { if (get().recoveryEpoch === epoch) set({ dataBusy: false }); }
  },

  cancelStart() {
    if (!get().crashed && !get().dataBusy) set({ pendingStart: null });
  },

  async resume() {
    if (!mayInteract() || get().dataBusy || useStorageHealth.getState().readErrors.length) return false;
    const epoch = get().recoveryEpoch;
    const saved = get().resumable;
    if (!saved) return false;
    const r = replayTolerant(saved.events);
    if (!r.game) {
      const t = dictFor(get().lang);
      get().showToast(t.store.restoreFailed(r.error ? errorText(t, r.error) : t.store.logBroken));
      // Keep the original log: a failed recovery must not delete the only copy.
      return false;
    }
    const recovery = get().currentRecovery;
    set({ dataBusy: true });
    try {
      if (recovery && !await backupGame(recovery.original, recovery.kind === 'migration' ? 'migration' : 'recovery')) {
        get().showToast(dictFor(get().lang).recovery.backupFailed);
        return false;
      }
      if (!mayInteract() || get().recoveryEpoch !== epoch) return false;
      openSaved(saved, r.game);
      if (recovery?.dropped) get().showToast(dictFor(get().lang).store.dropped(recovery.dropped));
      return true;
    } finally { if (get().recoveryEpoch === epoch) set({ dataBusy: false }); }
  },

  async restoreBackup(backup) {
    if (!mayInteract() || get().dataBusy || useStorageHealth.getState().readErrors.length) return false;
    const epoch = get().recoveryEpoch;
    const inspected = inspectGame(backup.original);
    if (inspected.kind !== 'ready' || inspected.game.state.phase.t === 'gameOver') return false;
    set({ dataBusy: true });
    try {
      const current = currentSnapshot();
      if (current !== undefined && !await backupGame(current, 'replacement')) {
        get().showToast(dictFor(get().lang).recovery.backupFailed);
        return false;
      }
      if (!mayInteract() || get().recoveryEpoch !== epoch) return false;
      openSaved(inspected.saved, inspected.game);
      if (inspected.dropped) get().showToast(dictFor(get().lang).store.dropped(inspected.dropped));
      return true;
    } finally { if (get().recoveryEpoch === epoch) set({ dataBusy: false }); }
  },

  dispatch(event) {
    if (!mayInteract() || get().dataBusy || get().privacyCovered) return false;
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
    const runtime = pauseRuntime(runtimeFor(r.value.state, get().runtime), r.value.state.phase.t !== 'gameOver' && get().paused);
    set({ game: r.value, runtime, paused: runtime.paused, secrets: closedSecrets() });
    persist(gameId, createdAt, r.value);
    return true;
  },

  undo() {
    if (!mayInteract() || get().dataBusy || get().privacyCovered) return;
    const { game, gameId, createdAt } = get();
    if (!game || !gameId || !canUndo(game)) return;
    const prev = engineUndo(game);
    const runtime = pauseRuntime(runtimeFor(prev.state, get().runtime), get().paused);
    set({ game: prev, runtime, paused: runtime.paused, secrets: closedSecrets() });
    persist(gameId, createdAt, prev);
  },

  canUndo() {
    const g = get().game;
    return !!g && canUndo(g);
  },

  closeGame() {
    if (!mayInteract() || get().dataBusy) return;
    const { game } = get();
    if (game && game.state.phase.t !== 'gameOver') {
      get().setPaused(true);
      // Abandoned: keep it resumable.
      const { gameId, createdAt } = get();
      if (gameId) set({ resumable: { schemaVersion: 1, id: gameId, createdAt, events: game.events, runtime: runtimeFor(game.state, get().runtime) } });
    } else {
      const { gameId, createdAt } = get();
      if (game && gameId) {
        void saveGame({ schemaVersion: 1, id: gameId, createdAt, finishedAt: Date.now(), events: game.events }, true);
      }
      if (game) set({ resumable: null });
    }
    set({ game: null, gameId: null, runtime: null, screen: { name: 'home' }, paused: false, secrets: closedSecrets() });
  },

  showToast(text) {
    const id = ++toastSeq;
    set({ toast: { id, text } });
    setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null });
    }, 3200);
  },

  setPaused(paused) {
    if (!mayInteract() || get().privacyCovered) return;
    const runtime = get().runtime;
    set({ paused, runtime: runtime ? pauseRuntime(runtime, paused) : null, secrets: closedSecrets() });
    checkpoint();
  },

  setSecret(kind, open) {
    if (open && (!mayInteract() || get().paused || get().privacyCovered || !get().game)) return;
    set({ secrets: { ...get().secrets, [kind]: open } });
  },

  suspend() {
    if (typeof document !== 'undefined') document.documentElement.dataset.privacy = 'covered';
    if (get().crashed || get().importing) { set({ privacyCovered: true, secrets: closedSecrets() }); return; }
    const state = get();
    const active = !!state.game && state.game.state.phase.t !== 'gameOver';
    set({ privacyCovered: true, privacyEpoch: state.privacyEpoch + 1, secrets: closedSecrets(),
      paused: active ? true : state.paused, runtime: state.runtime && active ? pauseRuntime(state.runtime, true) : state.runtime });
    if (active && mayWrite()) checkpoint();
  },

  uncover() {
    if (get().crashed) return;
    if (typeof document !== 'undefined') {
      if (document.hidden) return;
      delete document.documentElement.dataset.privacy;
    }
    set({ privacyCovered: false });
  },

  updateVotingDraft(update) {
    if (!mayInteract() || get().dataBusy || get().privacyCovered) return;
    const { runtime, game } = get();
    if (!runtime?.voting || !game || game.state.phase.t !== 'voting') return;
    set({ runtime: runtimeFor(game.state, { ...runtime, voting: update(runtime.voting) }) });
    checkpoint();
  },

  toggleTimer() {
    if (!mayInteract() || get().privacyCovered) return;
    const { runtime, paused } = get();
    if (!runtime?.timer || paused) return;
    const timer = runtime.timer;
    const now = Date.now();
    const remainingMs = timerRemaining(timer, now);
    if (remainingMs <= 0) return;
    const running = !timer.running;
    set({ runtime: { ...runtime, timer: { ...timer, remainingMs, running, deadline: running ? now + remainingMs : null } } });
    checkpoint();
  },

  resetTimer() {
    if (!mayInteract() || get().privacyCovered) return;
    const runtime = get().runtime;
    if (!runtime?.timer) return;
    set({ runtime: { ...runtime, timer: { ...runtime.timer, remainingMs: runtime.timer.totalMs, running: false, deadline: null } } });
    checkpoint();
  },

  finishTimer() {
    if (!mayInteract()) return;
    const runtime = get().runtime;
    if (!runtime?.timer || timerRemaining(runtime.timer) > 0) return;
    set({ runtime: { ...runtime, timer: { ...runtime.timer, remainingMs: 0, running: false, deadline: null } } });
    checkpoint();
  },

  ackHandBack() {
    if (!mayInteract() || get().privacyCovered) return;
    set({ handBackAck: true });
  },

  toggleSound() {
    if (!mayInteract()) return;
    const sound = !get().sound;
    setSoundEnabled(sound);
    set({ sound });
    persistPrefs();
  },

  toggleVibration() {
    if (!mayInteract()) return;
    const vibration = !get().vibration;
    setVibrationEnabled(vibration);
    set({ vibration });
    persistPrefs();
  },

  setKeepAwake(keepAwake) {
    if (!mayInteract()) return;
    set({ keepAwake });
    persistPrefs();
  },

  setLang(lang) {
    if (!mayInteract()) return;
    set({ lang });
    persistPrefs();
  },

  finishIntro(destination) {
    if (!mayInteract() || get().privacyCovered || useStorageHealth.getState().readErrors.length) return;
    set({ introSeen: true });
    persistPrefs();
    get().go({ name: destination });
  },

  async clearData(scope) {
    if (!mayInteract() || get().dataBusy || get().privacyCovered) throw new ImportError('cancelled');
    const epoch = get().recoveryEpoch + 1;
    const current = currentSnapshot();
    set({ importing: true, importComplete: false, dataOperation: scope, dataBusy: true, recoveryEpoch: epoch,
      secrets: closedSecrets(), paused: !!get().game || get().paused, runtime: get().runtime ? pauseRuntime(get().runtime!, true) : null });
    try {
      await commitClear(scope, current, () => !get().crashed && get().recoveryEpoch === epoch);
      sealStorageWrites();
      set({ importComplete: true, ...(scope === 'all' ? { game: null, gameId: null, runtime: null, resumable: null, currentRecovery: null, pendingStart: null, toast: null } : {}) });
    } catch (error) { set({ importing: false, dataBusy: false }); throw error; }
  },

  async importFile(plan) {
    if (!mayInteract() || get().dataBusy || get().privacyCovered) throw new ImportError('cancelled');
    const epoch = get().recoveryEpoch + 1;
    const current = currentSnapshot();
    set({ importing: true, importComplete: false, dataOperation: 'import', dataBusy: true, recoveryEpoch: epoch, secrets: closedSecrets(),
      paused: !!get().game || get().paused, runtime: get().runtime ? pauseRuntime(get().runtime!, true) : null });
    try {
      await commitImport(plan, current, () => !get().crashed && get().recoveryEpoch === epoch);
      sealStorageWrites();
      // The old in-memory tree must never save over the newly imported database.
      set({ importComplete: true });
    } catch (error) {
      set({ importing: false, dataBusy: false });
      throw error;
    }
  },
}));

useApp.subscribe((state) => {
  setSoundContext(state.screen?.name === 'game' ? state.game?.state?.phase?.t ?? null : null, state.paused || state.privacyCovered);
});

/** The current game state; only call inside the game screens. */
export function useGame() {
  const game = useApp((s) => s.game);
  if (!game) throw new Error('No active game');
  return game.state;
}

// Dev-only handle for testing in the browser console.
if (import.meta.env.DEV) (window as unknown as { __gm: typeof useApp }).__gm = useApp;
