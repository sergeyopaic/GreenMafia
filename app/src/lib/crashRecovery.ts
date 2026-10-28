import { create } from 'zustand';
import { APP_VERSION, BUILD_ID } from './appInfo';
import { useApp } from '../store';
import { runtimeFor } from './gameRuntime';
import { inspectGame, type GameInspection } from './saveFormat';
import { saveGame, type SavedGame } from './storage';
import { useStorageHealth } from './persistence';
import { mayWrite, useTabOwnership } from './tabOwnership';

export type CrashSource = 'react' | 'event' | 'promise' | 'startup';
const categories = ['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'URIError', 'EvalError'];
const screens = ['home', 'welcome', 'setup', 'game', 'history', 'backups', 'archive', 'rules', 'players', 'profile', 'settings', 'privacy', 'licenses'];

export interface CrashDiagnostic {
  format: 'greenmafia-diagnostics';
  version: 1;
  appVersion: string;
  build: string | null;
  occurredAt: number;
  source: CrashSource;
  category: string;
  screen: string;
  phase: string | null;
  storage: { pending: number; readFailed: boolean; writeFailed: boolean };
  ownership: string;
}

export interface CrashIncident {
  diagnostic: CrashDiagnostic;
  /** Private recovery data: never included in the shareable technical diagnostic. */
  recoveryData: unknown;
  hadActiveGame: boolean;
  canRetry: boolean;
}

export const useCrashState = create<{ incident: CrashIncident | null; generation: number }>(() => ({ incident: null, generation: 0 }));
let reporting = false;

function captureRecovery(): unknown {
  const state = useApp.getState();
  if (state.game && state.gameId) {
    const saved: SavedGame = { schemaVersion: 1, id: state.gameId, createdAt: state.createdAt, events: state.game.events };
    if (state.runtime) saved.runtime = state.runtime;
    if (state.game.state?.phase?.t === 'gameOver') saved.finishedAt = Date.now();
    return structuredClone(saved);
  }
  if (state.currentRecovery) return structuredClone(state.currentRecovery.original);
  return state.resumable ? structuredClone(state.resumable) : undefined;
}

/** Error messages/stacks may contain player names, roles or URLs. Do not retain them. */
export function reportCrash(error: unknown, source: CrashSource): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.crash = 'blocked';
  if (reporting || useCrashState.getState().incident) return;
  reporting = true;
  try {
    const state = useApp.getState();
    let recoveryData: unknown;
    let inspected: GameInspection = { kind: 'missing' };
    try { recoveryData = captureRecovery(); inspected = inspectGame(recoveryData); } catch { /* Keep the fault screen available even when data cannot be cloned. */ }
    const hadActiveGame = !!state.game;
    const complete = inspected.kind === 'ready' && inspected.dropped === 0;
    let pausedSave: SavedGame | null = null;
    if (hadActiveGame && complete && inspected.kind === 'ready') {
      const runtime = runtimeFor(inspected.game.state, inspected.saved.runtime, true);
      pausedSave = { ...inspected.saved, runtime };
      if (inspected.game.state.phase.t === 'gameOver') pausedSave.finishedAt ??= Date.now();
      recoveryData = pausedSave;
    }
    let category = 'Unknown';
    try { if (error instanceof Error && categories.includes(error.name)) category = error.name; } catch { /* Untrusted error getters are not diagnostics. */ }
    const storage = useStorageHealth.getState();
    const screenName = state.screen && typeof state.screen.name === 'string' ? state.screen.name : 'unknown';
    const diagnostic: CrashDiagnostic = {
      format: 'greenmafia-diagnostics', version: 1, appVersion: APP_VERSION,
      build: BUILD_ID,
      occurredAt: Date.now(), source, category,
      screen: screens.includes(screenName) ? screenName : 'unknown',
      phase: inspected.kind === 'ready' ? inspected.game.state.phase.t : null,
      storage: { pending: storage.pending, readFailed: storage.readErrors.length > 0, writeFailed: storage.writeErrors.length > 0 },
      ownership: useTabOwnership.getState().status,
    };
    useApp.setState({ crashed: true, recoveryEpoch: state.recoveryEpoch + 1, dataBusy: false, pendingStart: null,
      secrets: { role: false, peek: false, answer: false }, paused: true, privacyCovered: true,
      ...(pausedSave && inspected.kind === 'ready' ? { game: inspected.game, runtime: pausedSave.runtime! } : {}) });
    useCrashState.setState({ incident: { diagnostic, recoveryData, hadActiveGame, canRetry: !hadActiveGame || complete } });
    // Only a fully validated active log may be checkpointed. A damaged original is never truncated here.
    if (pausedSave && mayWrite() && !state.importing) void saveGame(pausedSave);
  } finally { reporting = false; }
}

/** Remount the interface without rereading an older autosave over live memory. */
export function recoverCrash(destination: 'retry' | 'home'): boolean {
  if (useApp.getState().importing) return false;
  const incident = useCrashState.getState().incident;
  if (!incident || (destination === 'retry' && !incident.canRetry)) return false;
  if (incident.hadActiveGame && incident.recoveryData === undefined) return false;
  if (incident.hadActiveGame && destination === 'home') {
    const inspected = inspectGame(incident.recoveryData);
    const resumable = inspected.kind === 'ready' ? inspected.saved : null;
    const kind = inspected.kind === 'ready' ? (inspected.dropped ? 'partial' : inspected.migrated ? 'migration' : null) : inspected.kind === 'future' ? 'future' : 'invalid';
    useApp.setState({ game: null, gameId: null, runtime: null, resumable,
      currentRecovery: kind ? { original: incident.recoveryData, kind, dropped: inspected.kind === 'ready' ? inspected.dropped : 0 } : null });
  }
  const game = useApp.getState().game;
  useApp.setState({ crashed: false, privacyCovered: false, paused: !!game && game.state.phase.t !== 'gameOver',
    ...(destination === 'home' ? { screen: { name: 'home' }, ready: true } : {}) });
  if (typeof document !== 'undefined') {
    delete document.documentElement.dataset.crash;
    delete document.documentElement.dataset.privacy;
  }
  useCrashState.setState((s) => ({ incident: null, generation: s.generation + 1 }));
  return true;
}

export function installCrashHandlers(host: Window = window): () => void {
  const onError = (event: ErrorEvent) => { event.preventDefault(); reportCrash(event.error, 'event'); };
  const onRejection = (event: PromiseRejectionEvent) => { event.preventDefault(); reportCrash(event.reason, 'promise'); };
  host.addEventListener('error', onError);
  host.addEventListener('unhandledrejection', onRejection);
  return () => {
    host.removeEventListener('error', onError);
    host.removeEventListener('unhandledrejection', onRejection);
  };
}
