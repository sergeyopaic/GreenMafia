import { MAX_NAME_LENGTH, type Player, ROLE_TEAM, type Role, playerHasAlibi, undo as engineUndo } from '@greenmafia/engine';
import { useEffect, useState } from 'react';
import { phaseTitle } from '../lib/phase';
import { useT } from '../i18n';
import { useApp, useGame } from '../store';
import { MiniChip } from './Chip';
import { RoleBrief } from './RoleBrief';
import { firstNightBrief } from '../lib/roleBrief';
import {
  IconBan,
  IconDoor,
  IconEye,
  IconFlag,
  IconHome,
  IconMenu,
  IconPause,
  IconPen,
  IconPlay,
  IconScale,
  IconSound,
  IconStop,
  IconUndo,
  RoleIcon,
} from './icons';
import { SeatPicker } from './SeatPicker';
import { Confirm, Sheet } from './Sheet';

type Dialog =
  | null
  | 'menu'
  | 'rules'
  | 'undo'
  | 'draw'
  | 'abort'
  | { player: string }
  | { seat: string }
  | { rename: string }
  | { confirmRemove: Player; cause: 'left' | 'removed' };

export function GameBar() {
  const state = useGame();
  const t = useT();
  const b = t.bar;
  const game = useApp((s) => s.game);
  const { dispatch, undo, paused, setPaused, closeGame, sound, toggleSound, vibration, toggleVibration } = useApp();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [tab, setTab] = useState<'players' | 'game'>('players');
  const [draft, setDraft] = useState('');
  const peek = useApp((s) => s.secrets.peek);
  const setPeek = (open: boolean) => useApp.getState().setSecret('peek', open);
  const { title, sub } = phaseTitle(state, t);
  const over = state.phase.t === 'gameOver';
  const inReveal = state.phase.t === 'reveal';
  const undoable = !!game && game.events.length > 1 && !inReveal;

  // Release the "eye" anywhere.
  useEffect(() => {
    if (!peek) return;
    const up = () => setPeek(false);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [peek]);

  useEffect(() => { if (paused) setDialog(null); }, [paused]);

  function onUndo() {
    if (!game) return;
    const prev = engineUndo(game).state;
    const crossesPhase =
      prev.phase.t !== state.phase.t || ('number' in prev.phase && 'number' in state.phase && prev.phase.number !== state.phase.number);
    if (crossesPhase) setDialog('undo');
    else undo();
  }

  const editable = !over && !inReveal;
  const byId = (id: string) => state.players.find((p) => p.id === id);
  const selected = dialog && typeof dialog === 'object' && 'player' in dialog ? byId(dialog.player) : undefined;
  const seatFor = dialog && typeof dialog === 'object' && 'seat' in dialog ? byId(dialog.seat) : undefined;
  const renameFor = dialog && typeof dialog === 'object' && 'rename' in dialog ? byId(dialog.rename) : undefined;

  /** Public status only: never the role. */
  function statusLine(p: Player): string {
    const parts: string[] = [];
    if (p.alive) parts.push(b.statusIn);
    else parts.push(p.death ? `${t.death[p.death.cause]} (${t.when(p.death.phase, p.death.number)})` : b.statusOut);
    if (p.alive && playerHasAlibi(state, p.id)) parts.push(t.chip.alibi);
    if (state.settings.fouls && p.fouls > 0) parts.push(t.count.fouls(p.fouls));
    return parts.join(' · ');
  }

  if (paused) return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={b.pausedTitle}>
      <div className="eyebrow">{b.pausedEyebrow}</div>
      <h1>{b.pausedTitle}</h1>
      <p className="muted">{b.pausedHint}</p>
      <button autoFocus type="button" className="btn btn--primary" onClick={() => setPaused(false)}>{b.resume}</button>
    </div>
  );

  return (
    <>
      <header className="topbar">
        <div className="topbar__title">
          <b>{title}</b>
          <span>{sub}</span>
        </div>
        <button type="button" className="icon-btn" disabled={!undoable} onClick={onUndo} aria-label={b.undo}>
          <IconUndo />
        </button>
        {!over && (
          <button
            type="button"
            className={`icon-btn${paused ? ' icon-btn--active' : ''}`}
            onClick={() => setPaused(!paused)}
            aria-label={paused ? b.resume : b.pause}
          >
            {paused ? <IconPlay /> : <IconPause />}
          </button>
        )}
        {!inReveal && !over && (
          <button
            type="button"
            className="icon-btn"
            onPointerDown={(e) => {
              e.preventDefault();
              setPeek(true);
            }}
            onContextMenu={(e) => e.preventDefault()}
            aria-label={b.eye}
          >
            <IconEye />
          </button>
        )}
        <button type="button" className="icon-btn" onClick={() => setDialog('menu')} aria-label={b.console}>
          <IconMenu />
        </button>
      </header>

      {peek && (
        <div className="overlay overlay--top" style={{ textAlign: 'left', alignItems: 'stretch' }}>
          <div className="eyebrow">{b.peekTitle}</div>
          <div className="list">
            {state.players.map((p) => (
              <div className="list__row" key={p.id} style={{ opacity: p.alive ? 1 : 0.45 }}>
                <MiniChip player={p} />
                <div className="list__main">
                  <div className="list__title">{p.name}</div>
                  <div className="list__sub">
                    {t.roles.team[ROLE_TEAM[p.role]]}
                    {!p.alive && b.out}
                    {p.fouls > 0 && b.fouls(p.fouls)}
                  </div>
                </div>
                <RoleIcon role={p.role} width={24} height={24} />
                <span style={{ minWidth: 96, textAlign: 'right' }}>{t.roles.name[p.role]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {dialog === 'menu' && (
        <Sheet title={b.console} onClose={() => setDialog(null)}>
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'players'} onClick={() => setTab('players')}>
              {b.tabPlayers}
            </button>
            <button type="button" role="tab" aria-selected={tab === 'game'} onClick={() => setTab('game')}>
              {b.tabGame}
            </button>
          </div>

          {tab === 'players' ? (
            <>
              <p className="list__sub">{b.playersHint(editable)}</p>
              <div className="list">
                {state.players.map((p) => (
                  <button type="button" key={p.id} className="list__row player-row" onClick={() => setDialog({ player: p.id })}>
                    <MiniChip player={p} />
                    <div className="list__main">
                      <div className="list__title">{p.name}</div>
                      <div className="list__sub">{statusLine(p)}</div>
                    </div>
                    <span className="type muted">›</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="list">
              <button type="button" className="sheet__item" onClick={() => setDialog('rules')}>
                <IconFlag /> {b.rules}
              </button>
              <button type="button" className="sheet__item" onClick={toggleSound}>
                <IconSound off={!sound} /> {b.sound(sound)}
              </button>
              <button type="button" className="sheet__item" onClick={toggleVibration}>
                {b.vibration(vibration)}
              </button>
              {!over && (
                <>
                  <button type="button" className="sheet__item" onClick={() => setDialog('draw')}>
                    <IconScale /> {b.draw}
                  </button>
                  <button type="button" className="sheet__item sheet__item--danger" onClick={() => setDialog('abort')}>
                    <IconStop /> {b.abort}
                  </button>
                </>
              )}
              <button type="button" className="sheet__item" onClick={closeGame}>
                <IconHome /> {b.home(over)}
              </button>
            </div>
          )}
        </Sheet>
      )}

      {selected && (
        <Sheet
          title={
            <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <MiniChip player={selected} /> {selected.name}
            </span>
          }
          onClose={() => setDialog('menu')}
        >
          <p className="muted">{statusLine(selected)}</p>
          <div className="list">
            {!over && (
              <>
                <button type="button" className="sheet__item" onClick={() => setDialog({ seat: selected.id })}>
                  <span className="mini-chip" aria-hidden="true">
                    <span>{t.num('')}</span>
                  </span>
                  {b.changeSeat(selected.seat)}
                </button>
                <button
                  type="button"
                  className="sheet__item"
                  onClick={() => {
                    setDraft(selected.name);
                    setDialog({ rename: selected.id });
                  }}
                >
                  <IconPen /> {b.rename}
                </button>
              </>
            )}
            {editable && selected.alive && (
              <>
                {state.settings.fouls && (
                  <button
                    type="button"
                    className="sheet__item"
                    onClick={() => {
                      const ok = dispatch({ type: 'Foul', playerId: selected.id });
                      if (ok) {
                        useApp
                          .getState()
                          .showToast(b.foulGiven(selected.seat, selected.fouls + 1));
                      }
                    }}
                  >
                    <IconFlag /> {b.foul(selected.fouls)}
                  </button>
                )}
                <button type="button" className="sheet__item" onClick={() => setDialog({ confirmRemove: selected, cause: 'left' })}>
                  <IconDoor /> {b.left}
                </button>
                <button
                  type="button"
                  className="sheet__item sheet__item--danger"
                  onClick={() => setDialog({ confirmRemove: selected, cause: 'removed' })}
                >
                  <IconBan /> {b.remove}
                </button>
              </>
            )}
          </div>
          {over && <p className="list__sub">{b.overNote}</p>}
          <button type="button" className="btn btn--secondary" onClick={() => setDialog('menu')}>
            {b.backToList}
          </button>
        </Sheet>
      )}

      {seatFor && (
        <SeatPicker
          title={b.seatTitle(seatFor.name)}
          current={seatFor.seat}
          hint={b.seatHint}
          takenBy={(n) => state.players.find((x) => x.seat === n && x.id !== seatFor.id)?.name ?? null}
          onPick={(n) => {
            if (n !== seatFor.seat && dispatch({ type: 'ChangeSeat', playerId: seatFor.id, seat: n })) {
              useApp.getState().showToast(b.seatChanged(seatFor.name, n));
            }
            setDialog({ player: seatFor.id });
          }}
          onClose={() => setDialog({ player: seatFor.id })}
        />
      )}

      {renameFor && (
        <Sheet title={b.renameTitle(renameFor.seat)} onClose={() => setDialog({ player: renameFor.id })}>
          <form
            style={{ display: 'grid', gap: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (dispatch({ type: 'RenamePlayer', playerId: renameFor.id, name: draft.trim() || t.defaultName(renameFor.seat) })) setDialog({ player: renameFor.id });
            }}
          >
            <input
              className="input"
              value={draft}
              maxLength={MAX_NAME_LENGTH}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              aria-label={b.renameAria}
            />
            <p className="list__sub">{b.renameNote}</p>
            <div className="actions__row">
              <button type="button" className="btn btn--secondary" onClick={() => setDialog({ player: renameFor.id })}>
                {t.common.cancel}
              </button>
              <button type="submit" className="btn btn--primary btn--plain">
                {t.common.save}
              </button>
            </div>
          </form>
        </Sheet>
      )}

      {dialog === 'undo' && (
        <Confirm
          title={b.undoTitle}
          text={b.undoText}
          okLabel={b.undoOk}
          onOk={() => {
            undo();
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}

      {dialog === 'rules' && (
        <Sheet title={b.rules} onClose={() => setDialog(null)}>
          <p>{firstNightBrief(state.settings, t.code)}</p>
          {Object.entries(state.composition).filter(([, count]) => count > 0).map(([role]) => (
            <section key={role} className="host-role-brief">
              <h3>{t.roles.name[role as Role]}</h3>
              <RoleBrief role={role as Role} settings={state.settings} />
            </section>
          ))}
          <button type="button" className="btn btn--secondary" onClick={() => setDialog('menu')}>{b.rulesBack}</button>
        </Sheet>
      )}

      {dialog === 'draw' && (
        <Confirm
          title={b.drawTitle}
          text={b.drawText}
          okLabel={b.drawOk}
          onOk={() => {
            dispatch({ type: 'EndGame', result: 'draw' });
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}

      {dialog === 'abort' && (
        <Confirm
          title={b.abortTitle}
          text={b.abortText}
          okLabel={b.abortOk}
          danger
          onOk={() => {
            dispatch({ type: 'EndGame', result: 'aborted' });
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}

      {dialog && typeof dialog === 'object' && 'confirmRemove' in dialog && (
        <Confirm
          title={dialog.cause === 'left' ? b.leaveTitle(dialog.confirmRemove.seat) : b.removeTitle(dialog.confirmRemove.seat)}
          text={b.removeText}
          okLabel={dialog.cause === 'left' ? b.leaveOk : b.removeOk}
          danger
          onOk={() => {
            dispatch({ type: 'RemovePlayer', playerId: dialog.confirmRemove.id, cause: dialog.cause });
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}
    </>
  );
}
