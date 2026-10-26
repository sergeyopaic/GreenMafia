import type { Player } from '@greenmafia/engine';
import type { ReactNode } from 'react';

export interface ChipLook {
  selected?: boolean;
  disabled?: boolean;
  /** Visible but not tappable, without dimming (e.g. read-only grids). */
  inert?: boolean;
  speaker?: boolean;
  candidate?: boolean;
  voted?: boolean;
  badge?: ReactNode;
  badgeTone?: 'default' | 'accent' | 'danger';
  tag?: ReactNode;
}

export function Chip({
  player,
  look = {},
  onClick,
}: {
  player: Player;
  look?: ChipLook;
  onClick?: (p: Player) => void;
}) {
  const cls = [
    'chip',
    look.selected && 'is-selected',
    look.disabled && 'is-disabled',
    !player.alive && 'is-dead',
    look.speaker && 'is-speaker',
    look.candidate && 'is-candidate',
    look.voted && 'is-voted',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={cls}
      disabled={look.inert || !onClick}
      aria-pressed={look.selected ?? undefined}
      aria-label={`№${player.seat}, ${player.name}${player.alive ? '' : ', выбыл'}`}
      onClick={() => onClick?.(player)}
    >
      <span className="chip__disc">
        <span className="chip__num">{player.seat}</span>
      </span>
      {look.badge !== undefined && look.badge !== null && (
        <span className={`chip__badge${look.badgeTone && look.badgeTone !== 'default' ? ` chip__badge--${look.badgeTone}` : ''}`}>
          {look.badge}
        </span>
      )}
      <span className="chip__name">{player.name}</span>
      <span className="chip__tag">{look.tag ?? ''}</span>
    </button>
  );
}

export function ChipGrid({
  players,
  look,
  onPick,
}: {
  players: Player[];
  look?: (p: Player) => ChipLook;
  onPick?: (p: Player) => void;
}) {
  return (
    <div className="chips" role="group">
      {players.map((p) => (
        <Chip key={p.id} player={p} look={look?.(p)} onClick={onPick} />
      ))}
    </div>
  );
}

export function MiniChip({ player }: { player: Pick<Player, 'seat'> }) {
  return (
    <span className="mini-chip" aria-label={`№${player.seat}`}>
      <span>{player.seat}</span>
    </span>
  );
}
