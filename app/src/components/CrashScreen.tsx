import { useState } from 'react';
import { dictFor } from '../i18n/dicts';
import { useApp } from '../store';
import { recoverCrash, useCrashState } from '../lib/crashRecovery';
import { exportJson } from '../lib/exportData';
import { retryStorage, useStorageHealth } from '../lib/persistence';

/** Intentionally independent of the game screens, their assets and exception text. */
export function CrashScreen() {
  const incident = useCrashState((s) => s.incident);
  const lang = useApp((s) => s.lang);
  const importing = useApp((s) => s.importing);
  const { pending, writeErrors } = useStorageHealth();
  const [message, setMessage] = useState('');
  const dict = dictFor(lang);
  const t = dict.crash;
  const download = (data: unknown, name: string) => {
    try { exportJson(`greenmafia-${name}-${Date.now()}.json`, data); setMessage(t.exported); }
    catch { setMessage(dict.recovery.exportFailed); }
  };
  return (
    <main className="crash-screen" role="alert" aria-labelledby="crash-title">
      <div className="crash-screen__body">
        <h1 id="crash-title">{t.title}</h1>
        <p>{t.hint}</p>
        {incident && <>
          {writeErrors.length > 0 && <div className="notice">
            <p>{dict.storage.writeHint}</p>
            <button type="button" className="btn btn--secondary" disabled={pending > 0} onClick={() => void retryStorage()}>{dict.storage.retry}</button>
          </div>}
          <div className="actions">
            <button autoFocus type="button" className="btn btn--primary" disabled={importing || !incident.canRetry} onClick={() => recoverCrash('retry')}>{t.retry}</button>
            <button type="button" className="btn btn--secondary" disabled={importing || (incident.hadActiveGame && incident.recoveryData === undefined)} onClick={() => recoverCrash('home')}>{t.home}</button>
          </div>
          {incident.recoveryData !== undefined && <section className="crash-screen__section">
            <p>{t.keepGame}</p>
            <p className="list__sub">{dict.recovery.exportPrivacy}</p>
            <button type="button" className="btn btn--secondary" onClick={() => download(incident.recoveryData, 'recovery')}>{t.exportGame}</button>
          </section>}
          <section className="crash-screen__section">
            <p>{t.diagnosticsHint}</p>
            <button type="button" className="btn btn--secondary" onClick={() => download(incident.diagnostic, 'diagnostics')}>{t.exportDiagnostics}</button>
          </section>
          <section className="crash-screen__section">
            <p className="list__sub">{t.reloadHint}</p>
            <button type="button" className="btn btn--ghost" disabled={pending > 0} onClick={() => window.location.reload()}>{dict.storage.reload}</button>
          </section>
        </>}
        {message && <p role="status">{message}</p>}
      </div>
    </main>
  );
}
