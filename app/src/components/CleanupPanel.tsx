import { useState } from 'react';
import { useT } from '../i18n';
import { exportDeviceData } from '../lib/exportData';
import { useApp } from '../store';

/** Clearing all records deliberately leaves no personal-data backup inside the app. */
export function CleanupPanel() {
  const t = useT(); const c = t.cleanup;
  const [scope, setScope] = useState<'history' | 'all' | null>(null);
  const [word, setWord] = useState('');
  const [message, setMessage] = useState('');
  const [exporting, setExporting] = useState(false);
  return <section className="settings__section" aria-labelledby="cleanup-title">
    <h2 id="cleanup-title">{c.title}</h2><p>{c.profileHint}</p>
    {!scope ? <div className="actions">
      <button type="button" className="btn btn--secondary" onClick={() => { setScope('history'); setMessage(''); }}>{c.history}</button>
      <button type="button" className="btn btn--secondary" onClick={() => { setScope('all'); setWord(''); setMessage(''); }}>{c.all}</button>
    </div> : <div className="import-preview" role="region" aria-labelledby="cleanup-confirm-title">
      <h3 id="cleanup-confirm-title">{scope === 'all' ? c.all : c.history}</h3>
      <p>{scope === 'all' ? c.allHint : c.historyHint}</p>
      {scope === 'all' && <>
        <p>{c.exportHint}</p>
        <button type="button" className="btn btn--secondary" disabled={exporting} onClick={async () => {
          setExporting(true); setMessage('');
          try { await exportDeviceData(); setMessage(t.crash.exported); } catch { setMessage(t.recovery.exportFailed); }
          finally { setExporting(false); }
        }}>{t.recovery.exportDevice}</button>
        <label className="import-file"><span>{c.typeWord(c.word)}</span><input autoFocus className="input" value={word} autoComplete="off" onChange={(event) => setWord(event.target.value)} /></label>
      </>}
      <div className="actions">
        <button type="button" className="btn btn--secondary" disabled={exporting} onClick={() => { setScope(null); setWord(''); setMessage(''); }}>{t.common.cancel}</button>
        <button type="button" className="btn btn--danger" disabled={exporting || (scope === 'all' && word.trim() !== c.word)} onClick={async () => {
          setMessage('');
          try { await useApp.getState().clearData(scope); } catch { setMessage(c.failed); }
        }}>{c.confirm}</button>
      </div>
    </div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
