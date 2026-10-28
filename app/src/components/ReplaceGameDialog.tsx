import { useEffect, useRef } from 'react';
import { useT } from '../i18n';
import { useApp } from '../store';
import { useStorageHealth } from '../lib/persistence';
import { useTabOwnership } from '../lib/tabOwnership';

/** A native modal keeps the underlying game/setup inert and restores focus on close. */
export function ReplaceGameDialog() {
  const pending = useApp((s) => s.pendingStart);
  const busy = useApp((s) => s.dataBusy);
  const readBlocked = useStorageHealth((s) => s.readErrors.length > 0);
  const owner = useTabOwnership((s) => s.status === 'owner');
  const covered = useApp((s) => s.privacyCovered);
  const canResume = useApp((s) => !!s.resumable || !!s.game);
  const dialog = useRef<HTMLDialogElement>(null);
  const t = useT().recovery;
  useEffect(() => {
    if (pending && !readBlocked && owner && !covered && !dialog.current?.open) dialog.current?.showModal();
    if ((!pending || readBlocked || !owner || covered) && dialog.current?.open) dialog.current.close();
  }, [pending, readBlocked, owner, covered]);
  return (
    <dialog ref={dialog} className="data-dialog" aria-labelledby="replace-game-title" aria-describedby="replace-game-hint"
      onCancel={(e) => { e.preventDefault(); useApp.getState().cancelStart(); }}>
      <h2 id="replace-game-title">{t.replaceTitle}</h2>
      <p id="replace-game-hint" className="muted">{t.replaceHint}</p>
      <div className="actions">
        {canResume && <button type="button" className="btn btn--primary" disabled={busy} onClick={() => {
          const state = useApp.getState();
          state.cancelStart();
          if (state.game) state.go({ name: 'game' });
          else void state.resume();
        }}>{t.keepPlaying}</button>}
        <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => void useApp.getState().confirmStart()}>{busy ? t.backingUp : t.backupAndStart}</button>
        <button autoFocus type="button" className="btn btn--ghost" disabled={busy} onClick={() => useApp.getState().cancelStart()}>{t.cancel}</button>
      </div>
    </dialog>
  );
}
