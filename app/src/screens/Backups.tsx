import { useEffect, useMemo, useRef, useState } from 'react';
import { IconBack } from '../components/icons';
import { useT } from '../i18n';
import { loadBackups, type GameBackup } from '../lib/backups';
import { exportJson, exportDeviceData } from '../lib/exportData';
import { inspectGame } from '../lib/saveFormat';
import { useApp } from '../store';
import { useStorageHealth } from '../lib/persistence';
import { useTabOwnership } from '../lib/tabOwnership';
import { loadDeviceCopies, deviceEnvelope } from '../lib/importData';
import type { DeviceCopy } from '../lib/deviceFormat';

export function BackupsScreen({ back = 'history' }: { back?: 'settings' | 'history' }) {
  const [items, setItems] = useState<GameBackup[] | null>(null);
  const [deviceCopies, setDeviceCopies] = useState<DeviceCopy[] | null>(null);
  const [selected, setSelected] = useState<GameBackup | null>(null);
  const [exporting, setExporting] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = useApp((s) => s.dataBusy);
  const readBlocked = useStorageHealth((s) => s.readErrors.length > 0);
  const owner = useTabOwnership((s) => s.status === 'owner');
  const covered = useApp((s) => s.privacyCovered);
  const t = useT();
  const r = t.recovery;
  useEffect(() => { void loadBackups().then(setItems); void loadDeviceCopies().then(setDeviceCopies); }, []);
  useEffect(() => {
    if (selected && !readBlocked && owner && !covered && !dialog.current?.open) dialog.current?.showModal();
    if ((!selected || readBlocked || !owner || covered) && dialog.current?.open) dialog.current.close();
  }, [selected, readBlocked, owner, covered]);
  const rows = useMemo(() => items?.map((backup) => ({ backup, inspected: inspectGame(backup.original) })), [items]);

  return (
    <main className="screen">
      <header className="topbar">
        <button type="button" className="icon-btn" onClick={() => useApp.getState().go({ name: back })} aria-label={t.common.back}><IconBack /></button>
        <div className="topbar__title"><b>{r.backupsTitle}</b><span>{r.backupsSub}</span></div>
      </header>
      <p className="muted">{r.backupsHint}</p>
      <p className="list__sub">{r.exportPrivacy}</p>
      <button type="button" className="btn btn--secondary" disabled={exporting} onClick={async () => {
        setExporting(true);
        try { await exportDeviceData(); } catch { useApp.getState().showToast(r.exportFailed); }
        finally { setExporting(false); }
      }}>{r.exportDevice}</button>
      {items?.length === 0 && deviceCopies?.length === 0 && <p className="hand">{r.noBackups}</p>}
      {deviceCopies && deviceCopies.length > 0 && <section className="settings__section">
        <h2>{t.transfer.deviceCopies}</h2><p>{t.transfer.copiesHint}</p>
        {deviceCopies.map((copy) => <article className="backup-card" key={copy.id}>
          <h3>{new Date(copy.createdAt).toLocaleString(t.locale)}</h3>
          {copy.operation === 'history-clear' && <p>{t.cleanup.historyCopy}</p>}
          <div className="actions">
            <button type="button" className="btn btn--secondary" onClick={() => {
              try { exportJson(`greenmafia-before-import-${copy.id}.json`, deviceEnvelope(copy.data)); }
              catch { useApp.getState().showToast(r.exportFailed); }
            }}>{t.transfer.exportCopy}</button>
            {copy.source !== null && <button type="button" className="btn btn--secondary" onClick={() => {
              try { exportJson(`greenmafia-import-source-${copy.id}.json`, copy.source); }
              catch { useApp.getState().showToast(r.exportFailed); }
            }}>{t.transfer.exportSource}</button>}
          </div>
        </article>)}
      </section>}
      <div className="list">
        {rows?.map(({ backup, inspected }) => (
          <article className="backup-card" key={backup.id}>
            <h3>{r.reasons[backup.reason]}</h3>
            <p className="list__sub">{new Date(backup.createdAt).toLocaleString(t.locale)}</p>
            <p className="muted">{inspected.kind === 'ready' ? r.backupPlayers(inspected.game.state.players.length, inspected.game.events.length) : inspected.kind === 'future' ? r.futureHint : r.invalidHint}</p>
            {inspected.kind === 'ready' && inspected.dropped > 0 && <p className="muted">{r.partialHint(inspected.dropped)}</p>}
            <div className="actions__row">
              <button type="button" className="btn btn--secondary" onClick={() => {
                try { exportJson(`greenmafia-original-${backup.id}.json`, backup.original); }
                catch { useApp.getState().showToast(r.exportFailed); }
              }}>{r.exportOriginal}</button>
              {inspected.kind === 'ready' && inspected.game.state.phase.t !== 'gameOver' && <button type="button" className="btn btn--primary" onClick={() => setSelected(backup)}>{r.restore}</button>}
            </div>
          </article>
        ))}
      </div>
      <dialog ref={dialog} className="data-dialog" aria-labelledby="restore-backup-title" onCancel={(e) => { e.preventDefault(); if (!busy) setSelected(null); }}>
        <h2 id="restore-backup-title">{r.restoreTitle}</h2>
        <p className="muted">{r.restoreHint}</p>
        <div className="actions__row">
          <button autoFocus type="button" className="btn btn--secondary" disabled={busy} onClick={() => setSelected(null)}>{t.common.cancel}</button>
          <button type="button" className="btn btn--primary" disabled={busy} onClick={async () => {
            if (selected && await useApp.getState().restoreBackup(selected)) setSelected(null);
          }}>{busy ? r.backingUp : r.restore}</button>
        </div>
      </dialog>
    </main>
  );
}
