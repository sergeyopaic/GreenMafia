import { useT } from '../i18n';
import { useTabOwnership } from '../lib/tabOwnership';
import { useApp } from '../store';
import { exportJson } from '../lib/exportData';

export function TabStatus() {
  const status = useTabOwnership((s) => s.status);
  const dict = useT();
  const t = dict.ownership;
  const game = useApp((s) => s.game);
  if (status === 'owner') return null;
  return (
    <div className="overlay tab-status" role="alertdialog" aria-modal="true" aria-labelledby="tab-status-title">
      <h2 id="tab-status-title">{status === 'checking' ? t.opening : status === 'blocked' ? t.blockedTitle : t.failedTitle}</h2>
      {status !== 'checking' && <>
        <p className="muted">{status === 'blocked' ? t.blockedHint : status === 'unsupported' ? t.unsupportedHint : t.failedHint}</p>
        {game && <>
          <p>{t.saveMemory}</p>
          <p className="list__sub">{dict.recovery.exportPrivacy}</p>
          <button type="button" className="btn btn--secondary" onClick={() => {
            const current = useApp.getState();
            if (!current.game || !current.gameId) return;
            try {
              exportJson(`greenmafia-open-${Date.now()}.json`, { schemaVersion: 1, id: current.gameId, createdAt: current.createdAt,
                events: current.game.events, runtime: current.runtime, ...(current.game.state.phase.t === 'gameOver' ? { finishedAt: Date.now() } : {}) });
            } catch { current.showToast(dict.recovery.exportFailed); }
          }}>{t.exportOpenGame}</button>
        </>}
        <button autoFocus type="button" className="btn btn--primary" onClick={() => window.location.reload()}>{t.reload}</button>
      </>}
    </div>
  );
}
