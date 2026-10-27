import type { Player } from '@greenmafia/engine';
import { type ReactNode, useEffect } from 'react';
import { useT } from '../i18n';
import { ChipGrid, type ChipLook } from './Chip';

/** Bottom sheet with a dimmed backdrop. */
export function Sheet({ title, onClose, children }: { title?: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        {title && <h3>{title}</h3>}
        {children}
      </div>
    </>
  );
}

export function Confirm({
  title,
  text,
  okLabel,
  danger,
  onOk,
  onCancel,
}: {
  title: string;
  text?: ReactNode;
  okLabel?: string;
  danger?: boolean;
  onOk: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <Sheet title={title} onClose={onCancel}>
      {text && <p className="muted">{text}</p>}
      <div className="actions__row">
        <button type="button" className="btn btn--secondary" onClick={onCancel}>
          {t.common.cancel}
        </button>
        <button type="button" className={`btn ${danger ? 'btn--danger' : 'btn--primary btn--plain'}`} onClick={onOk}>
          {okLabel ?? t.common.yes}
        </button>
      </div>
    </Sheet>
  );
}

export function PlayerPicker({
  title,
  hint,
  players,
  allowed,
  look,
  onPick,
  onClose,
}: {
  title: string;
  hint?: string;
  players: Player[];
  allowed: (p: Player) => boolean;
  look?: (p: Player) => ChipLook;
  onPick: (p: Player) => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <Sheet title={title} onClose={onClose}>
      {hint && <p className="muted">{hint}</p>}
      <ChipGrid
        players={players}
        look={(p) => ({ ...look?.(p), disabled: !allowed(p), inert: !allowed(p) })}
        onPick={(p) => allowed(p) && onPick(p)}
      />
      <button type="button" className="btn btn--secondary" onClick={onClose}>
        {t.common.cancel}
      </button>
    </Sheet>
  );
}
