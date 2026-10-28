import { useT } from '../i18n';
import { retryStorage, useStorageHealth } from '../lib/persistence';
import { exportDeviceData } from '../lib/exportData';
import { useApp } from '../store';

/** Visible across all screens: a failed save never disappears as a timed toast. */
export function StorageStatus() {
  const dict = useT();
  const t = dict.storage;
  const { pending, writeErrors, readErrors, lastSavedAt } = useStorageHealth();
  if (readErrors.length) {
    return (
      <div className="overlay storage-read-error" role="alertdialog" aria-modal="true" aria-labelledby="storage-read-title">
        <h2 id="storage-read-title">{t.readTitle}</h2>
        <p>{t.readHint}</p>
        <p className="list__sub">{dict.recovery.exportPrivacy}</p>
        <button type="button" className="btn btn--secondary" onClick={async () => {
          try { await exportDeviceData(); } catch { useApp.getState().showToast(dict.recovery.exportFailed); }
        }}>{dict.recovery.exportDevice}</button>
        <button autoFocus type="button" className="btn btn--primary" onClick={() => window.location.reload()}>{t.reload}</button>
      </div>
    );
  }
  if (writeErrors.length) {
    return (
      <div className="storage-warning" role="alert">
        <div><b>{t.writeTitle}</b><p>{t.writeHint}</p></div>
        <button type="button" className="btn btn--secondary" disabled={pending > 0} onClick={() => void retryStorage()}>{t.retry}</button>
      </div>
    );
  }
  if (!pending && !lastSavedAt) return null;
  return <div className="storage-status" role="status">{pending ? t.saving : t.saved}</div>;
}
