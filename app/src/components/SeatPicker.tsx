import { MAX_SEAT, type Player } from '@greenmafia/engine';
import { useT } from '../i18n';
import { Chip } from './Chip';
import { Sheet } from './Sheet';

/** Chips 1–20 for a seat number; numbers taken by other players cannot be chosen. */
export function SeatPicker({
  title,
  current,
  takenBy,
  onPick,
  onClose,
  hint,
}: {
  title: string;
  /** Current number of this player, or 0 if none. */
  current: number;
  /** Name of whoever already has this number, or null if it is free. */
  takenBy: (n: number) => string | null;
  onPick: (n: number) => void;
  onClose: () => void;
  hint?: string;
}) {
  const t = useT();
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="muted">{hint ?? t.setup.seatPickerHint}</p>
      <div className="chips chips--5 seat-grid" role="group" aria-label={t.setup.seatPickerAria}>
        {Array.from({ length: MAX_SEAT }, (_, k) => k + 1).map((n) => {
          const holder = takenBy(n);
          const chip: Player = { id: `seat${n}`, seat: n, name: '', role: 'civilian', alive: true, death: null, fouls: 0, skipNextSpeech: false };
          return (
            <Chip
              key={n}
              player={chip}
              look={{ selected: n === current, disabled: !!holder, inert: !!holder, tag: holder ?? (n === current ? t.setup.seatNow : '') }}
              onClick={() => onPick(n)}
            />
          );
        })}
      </div>
      <button type="button" className="btn btn--secondary" onClick={onClose}>
        {t.common.cancel}
      </button>
    </Sheet>
  );
}
