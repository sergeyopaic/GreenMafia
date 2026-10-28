import { useRef, useState } from 'react';
import { useT } from '../i18n';
import { ImportError, readImportFile, type ImportPlan } from '../lib/deviceFormat';
import { useApp } from '../store';

export function ImportPanel() {
  const t = useT(); const f = t.transfer;
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  return <section className="settings__section" aria-labelledby="import-title">
    <h2 id="import-title">{f.title}</h2>
    <p>{f.hint}</p>
    <label className="import-file"><span>{f.choose}</span><input type="file" accept=".json,application/json" disabled={reading} onChange={async (event) => {
      const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
      if (!file) return;
      const current = ++sequence.current; setReading(true); setPlan(null); setError('');
      try { const next = await readImportFile(file); if (current === sequence.current) setPlan(next); }
      catch (cause) { if (current === sequence.current) setError(f.errors[cause instanceof ImportError ? cause.code : 'invalid']); }
      finally { if (current === sequence.current) setReading(false); }
    }} /></label>
    {reading && <p role="status">{f.reading}</p>}
    {error && <p className="notice notice--warn" role="alert">{error}</p>}
    {plan && <div className="import-preview" role="region" aria-labelledby="import-preview-title">
      <h3 id="import-preview-title">{plan.kind === 'device' ? f.deviceTitle : f.gameTitle}</h3>
      <p>{f.summary(plan.games, plan.profiles, plan.backups)}</p>
      <p>{plan.hasCurrent ? f.hasCurrent : f.noCurrent}</p>
      <p>{plan.kind === 'device' ? f.replaceDevice : plan.hasCurrent ? f.replaceGame : f.addArchive}</p>
      <p className="list__sub">{f.backupHint}</p>
      <p className="list__sub">{t.recovery.exportPrivacy}</p>
      <div className="actions">
        <button type="button" className="btn btn--secondary" onClick={() => { sequence.current++; setPlan(null); setError(''); }}>{t.common.cancel}</button>
        <button type="button" className="btn btn--primary" onClick={async () => {
          setError('');
          try { await useApp.getState().importFile(plan); }
          catch (cause) { setError(f.errors[cause instanceof ImportError ? cause.code : 'storage']); }
        }}>{f.confirm}</button>
      </div>
    </div>}
  </section>;
}

/** Outside the old screen tree, which stays inert until the newly imported base is loaded. */
export function ImportStatus() {
  const importing = useApp((s) => s.importing); const complete = useApp((s) => s.importComplete);
  const operation = useApp((s) => s.dataOperation);
  const t = useT();
  if (!importing) return null;
  return <div className="overlay import-status" role="alertdialog" aria-modal="true" aria-labelledby="import-status-title">
    <h2 id="import-status-title">{operation === 'import' ? complete ? t.transfer.complete : t.transfer.importing : complete ? t.cleanup.complete : t.cleanup.working}</h2>
    <p>{operation === 'import' ? complete ? t.transfer.restartHint : t.transfer.waitHint : complete ? operation === 'all' ? t.cleanup.allDone : t.cleanup.historyDone : t.cleanup.wait}</p>
    {complete && <button autoFocus type="button" className="btn btn--primary" onClick={() => window.location.reload()}>{t.storage.reload}</button>}
  </div>;
}
