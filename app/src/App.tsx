import { useEffect, useRef, useState } from 'react';
import { type Theme, themeOf } from './lib/phase';
import { GameScreen } from './screens/Game';
import { HistoryScreen, ArchiveScreen } from './screens/History';
import { HomeScreen } from './screens/Home';
import { RulesScreen } from './screens/Rules';
import { SetupScreen } from './screens/Setup';
import { useApp } from './store';

function useTheme(): Theme {
  const screen = useApp((s) => s.screen);
  const state = useApp((s) => s.game?.state ?? null);
  if (screen.name === 'game') return themeOf(state);
  if (screen.name === 'home') return 'night';
  return 'day';
}

/** Keep the host's screen on during a game. */
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
  const ready = useApp((s) => s.ready);
  const screen = useApp((s) => s.screen);
  const toast = useApp((s) => s.toast);
  const init = useApp((s) => s.init);
  const theme = useTheme();

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'night' ? '#08160F' : '#EBE0C6');
  }, [theme]);

  useWakeLock(screen.name === 'game');

  return (
    <>
      <div className="backdrop" />
      <Veil theme={theme} enabled={screen.name === 'game'} />
      <div className="app">
        {ready && screen.name === 'home' && <HomeScreen />}
        {ready && screen.name === 'setup' && <SetupScreen />}
        {ready && screen.name === 'game' && <GameScreen />}
        {ready && screen.name === 'history' && <HistoryScreen />}
        {ready && screen.name === 'archive' && <ArchiveScreen saved={screen.game} />}
        {ready && screen.name === 'rules' && <RulesScreen />}
      </div>
      {toast && (
        <div key={toast.id} className="toast" role="status">
          {toast.text}
        </div>
      )}
    </>
  );
}
