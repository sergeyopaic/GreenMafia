import { useEffect, useRef, useState } from 'react';
import { type Theme, themeOf } from './lib/phase';
import { GameScreen } from './screens/Game';
import { HistoryScreen, ArchiveScreen } from './screens/History';
import { HomeScreen } from './screens/Home';
import { WelcomeScreen } from './screens/Welcome';
import { SettingsScreen } from './screens/Settings';
import { InformationScreen } from './screens/Information';
import { PlayersScreen, ProfileScreen } from './screens/Players';
import { RulesScreen } from './screens/Rules';
import { SetupScreen } from './screens/Setup';
import { useApp } from './store';
import { StorageStatus } from './components/StorageStatus';
import { useStorageHealth } from './lib/persistence';
import { ReplaceGameDialog } from './components/ReplaceGameDialog';
import { BackupsScreen } from './screens/Backups';
import { claimTabOwnership, useTabOwnership } from './lib/tabOwnership';
import { TabStatus } from './components/TabStatus';
import { installAppLifecycle } from './lib/appLifecycle';
import { useT } from './i18n';
import { ImportStatus } from './components/ImportPanel';
import { wantsWakeLock } from './lib/wakeLock';

function useTheme(): Theme {
  const screen = useApp((s) => s.screen);
  const state = useApp((s) => s.game?.state ?? null);
  if (screen.name === 'game') return themeOf(state);
  if (screen.name === 'home' || screen.name === 'welcome') return 'night';
  return 'day';
}

/** Keeps the screen on while `on` is true (see the "Keep screen on" setting). */
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = () => {
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          if (cancelled) void l.release();
          else lock = l;
        })
        .catch(() => {});
    };
    acquire();
    const onVis = () => document.visibilityState === 'visible' && acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release();
    };
  }, [on]);
}

function Veil({ theme, enabled }: { theme: Theme; enabled: boolean }) {
  const prev = useRef(theme);
  const [veil, setVeil] = useState<{ theme: Theme; key: number } | null>(null);
  useEffect(() => {
    if (prev.current !== theme && enabled) {
      setVeil({ theme, key: Date.now() });
      const id = window.setTimeout(() => setVeil(null), 1000);
      prev.current = theme;
      return () => window.clearTimeout(id);
    }
    prev.current = theme;
  }, [theme, enabled]);
  if (!veil) return null;
  if (veil.theme === 'night') return <div key={veil.key} className="veil veil--night" />;
  return (
    <div key={veil.key} className="veil veil--day">
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} style={{ animationDelay: `${i * 35}ms` }} />
      ))}
    </div>
  );
}

export function App() {
  const t = useT();
  const ready = useApp((s) => s.ready);
  const screen = useApp((s) => s.screen);
  const toast = useApp((s) => s.toast);
  const init = useApp((s) => s.init);
  const theme = useTheme();
  const readBlocked = useStorageHealth((s) => s.readErrors.length > 0);
  const ownership = useTabOwnership((s) => s.status);
  const privacyCovered = useApp((s) => s.privacyCovered);
  const importing = useApp((s) => s.importing);
  const blocked = readBlocked || ownership !== 'owner';

  useEffect(() => {
    let cancelled = false;
    void claimTabOwnership().then((owner) => { if (owner && !cancelled) void init(); });
    return () => { cancelled = true; };
  }, [init]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'night' ? '#08160F' : '#EBE0C6');
  }, [theme]);

  // The page language drives hyphenation, screen readers and the CSS-generated labels (:lang(en)).
  const lang = useApp((s) => s.lang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const keepAwake = useApp((s) => s.keepAwake);
  useWakeLock(wantsWakeLock(keepAwake, screen.name, ownership === 'owner'));

  useEffect(() => {
    return installAppLifecycle();
  }, []);

  useEffect(() => {
    if (ready && ownership !== 'owner') useApp.getState().suspend();
  }, [ready, ownership]);

  return (
    <>
      <div className="backdrop" />
      <Veil theme={theme} enabled={screen.name === 'game'} />
      <div className="app">
        <TabStatus />
        <StorageStatus />
        <div className="app-content" inert={blocked || privacyCovered || importing}>
          {ready && screen.name === 'home' && <HomeScreen />}
          {ready && screen.name === 'welcome' && <WelcomeScreen />}
          {ready && screen.name === 'settings' && <SettingsScreen />}
          {ready && (screen.name === 'privacy' || screen.name === 'licenses') && <InformationScreen key={screen.name} page={screen.name} />}
          {ready && screen.name === 'setup' && <SetupScreen />}
          {ready && screen.name === 'game' && <GameScreen />}
          {ready && screen.name === 'history' && <HistoryScreen />}
          {ready && screen.name === 'backups' && <BackupsScreen back={screen.back} />}
          {ready && screen.name === 'archive' && <ArchiveScreen saved={screen.game} back={screen.back} />}
          {ready && screen.name === 'players' && <PlayersScreen />}
          {ready && screen.name === 'profile' && <ProfileScreen key={screen.id} id={screen.id} />}
          {ready && screen.name === 'rules' && <RulesScreen />}
          <ReplaceGameDialog />
        </div>
      </div>
      <ImportStatus />
      <div className="privacy-curtain" aria-hidden={!privacyCovered}>
        <h2>{t.privacy.title}</h2>
        <button type="button" className="btn btn--primary" onClick={() => useApp.getState().uncover()}>{t.privacy.return}</button>
      </div>
      {toast && (
        <div key={toast.id} className="toast" role="status">
          {toast.text}
        </div>
      )}
    </>
  );
}
