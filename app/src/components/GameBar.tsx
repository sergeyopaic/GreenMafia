import { MAX_NAME_LENGTH, type Player, ROLE_TEAM, TEAM_NAME, playerHasAlibi, undo as engineUndo } from '@greenmafia/engine';
import { useEffect, useState } from 'react';
import { phaseTitle } from '../lib/phase';
import { DEATH_CAUSE, ROLE_NAME, plural } from '../lib/text';
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
  const game = useApp((s) => s.game);
  const { dispatch, undo, paused, setPaused, closeGame, sound, toggleSound } = useApp();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [tab, setTab] = useState<'players' | 'game'>('players');
  const [draft, setDraft] = useState('');
  const [peek, setPeek] = useState(false);
  const { title, sub } = phaseTitle(state);
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
    if (p.alive) parts.push('в игре');
    else parts.push(p.death ? `${DEATH_CAUSE[p.death.cause]} (${p.death.phase === 'night' ? 'ночь' : 'день'} ${p.death.number})` : 'выбыл');
    if (p.alive && playerHasAlibi(state, p.id)) parts.push('алиби');
    if (state.settings.fouls && p.fouls > 0) parts.push(`${p.fouls} ${plural(p.fouls, 'фол', 'фола', 'фолов')}`);
    return parts.join(' · ');
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar__title">
          <b>{title}</b>
          <span>{sub}</span>
        </div>
        <button type="button" className="icon-btn" disabled={!undoable} onClick={onUndo} aria-label="Отменить последнее действие">
          <IconUndo />
        </button>
        {!over && (
          <button
            type="button"
            className={`icon-btn${paused ? ' icon-btn--active' : ''}`}
            onClick={() => setPaused(!paused)}
            aria-label={paused ? 'Продолжить' : 'Пауза'}
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
            aria-label="Шпаргалка ролей: удерживайте"
          >
            <IconEye />
          </button>
        )}
        <button type="button" className="icon-btn" onClick={() => setDialog('menu')} aria-label="Пульт ведущего">
          <IconMenu />
        </button>
      </header>

      {peek && (
        <div className="overlay overlay--top" style={{ textAlign: 'left', alignItems: 'stretch' }}>
          <div className="eyebrow">Шпаргалка ведущего · отпустите, чтобы скрыть</div>
          <div className="list">
            {state.players.map((p) => (
              <div className="list__row" key={p.id} style={{ opacity: p.alive ? 1 : 0.45 }}>
                <MiniChip player={p} />
                <div className="list__main">
                  <div className="list__title">{p.name}</div>
                  <div className="list__sub">
                    {TEAM_NAME[ROLE_TEAM[p.role]]}
                    {!p.alive && ' · выбыл'}
                    {p.fouls > 0 && ` · фолов: ${p.fouls}`}
                  </div>
                </div>
                <RoleIcon role={p.role} width={24} height={24} />
                <span style={{ minWidth: 96, textAlign: 'right' }}>{ROLE_NAME[p.role]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {paused && (
        <div className="overlay">
          <div className="eyebrow">игра остановлена</div>
          <h1>Пауза</h1>
          <p className="muted">Таймеры стоят. На экране ничего секретного.</p>
          <button type="button" className="btn btn--primary" onClick={() => setPaused(false)}>
            Продолжить
          </button>
        </div>
      )}

      {dialog === 'menu' && (
        <Sheet title="Пульт ведущего" onClose={() => setDialog(null)}>
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'players'} onClick={() => setTab('players')}>
              Игроки
            </button>
            <button type="button" role="tab" aria-selected={tab === 'game'} onClick={() => setTab('game')}>
              Партия
            </button>
          </div>

          {tab === 'players' ? (
            <>
              <p className="list__sub">Нажмите на игрока: сменить номер, исправить имя{editable && ', удалить'}. Роли здесь не видны.</p>
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
                <IconFlag /> Правила этой партии
              </button>
              <button type="button" className="sheet__item" onClick={toggleSound}>
                <IconSound off={!sound} /> Звук и вибрация: {sound ? 'вкл' : 'выкл'}
              </button>
              {!over && (
                <>
                  <button type="button" className="sheet__item" onClick={() => setDialog('draw')}>
                    <IconScale /> Объявить ничью
                  </button>
                  <button type="button" className="sheet__item sheet__item--danger" onClick={() => setDialog('abort')}>
                    <IconStop /> Прервать игру
                  </button>
                </>
              )}
              <button type="button" className="sheet__item" onClick={closeGame}>
                <IconHome /> {over ? 'На главную' : 'На главную (игра сохранится)'}
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
                    <span>№</span>
                  </span>
                  Сменить номер · сейчас №{selected.seat}
                </button>
                <button
                  type="button"
                  className="sheet__item"
                  onClick={() => {
                    setDraft(selected.name);
                    setDialog({ rename: selected.id });
                  }}
                >
                  <IconPen /> Исправить имя
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
                          .showToast(selected.fouls + 1 >= 4 ? `№${selected.seat} удалён (4-й фол)` : `Фол №${selected.seat}: ${selected.fouls + 1}`);
                      }
                    }}
                  >
                    <IconFlag /> Фол · сейчас {selected.fouls}
                  </button>
                )}
                <button type="button" className="sheet__item" onClick={() => setDialog({ confirmRemove: selected, cause: 'left' })}>
                  <IconDoor /> Игрок покинул игру
                </button>
                <button
                  type="button"
                  className="sheet__item sheet__item--danger"
                  onClick={() => setDialog({ confirmRemove: selected, cause: 'removed' })}
                >
                  <IconBan /> Удалить за нарушение
                </button>
              </>
            )}
          </div>
          {over && <p className="list__sub">Игра окончена — изменения недоступны. Отменить финал можно кнопкой ↶.</p>}
          <button type="button" className="btn btn--secondary" onClick={() => setDialog('menu')}>
            К списку игроков
          </button>
        </Sheet>
      )}

      {seatFor && (
        <SeatPicker
          title={`Номер: ${seatFor.name}`}
          current={seatFor.seat}
          hint="Номер — только метка игрока, на очерёдность не влияет. Занятые номера недоступны."
          takenBy={(n) => state.players.find((x) => x.seat === n && x.id !== seatFor.id)?.name ?? null}
          onPick={(n) => {
            if (n !== seatFor.seat && dispatch({ type: 'ChangeSeat', playerId: seatFor.id, seat: n })) {
              useApp.getState().showToast(`${seatFor.name}: теперь №${n}`);
            }
            setDialog({ player: seatFor.id });
          }}
          onClose={() => setDialog({ player: seatFor.id })}
        />
      )}

      {renameFor && (
        <Sheet title={`Имя: №${renameFor.seat}`} onClose={() => setDialog({ player: renameFor.id })}>
          <form
            style={{ display: 'grid', gap: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (dispatch({ type: 'RenamePlayer', playerId: renameFor.id, name: draft })) setDialog({ player: renameFor.id });
            }}
          >
            <input
              className="input"
              value={draft}
              maxLength={MAX_NAME_LENGTH}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Имя игрока"
            />
            <p className="list__sub">Имя меняется только в этой партии. Профиль в базе — на главном экране, раздел «Игроки».</p>
            <div className="actions__row">
              <button type="button" className="btn btn--secondary" onClick={() => setDialog({ player: renameFor.id })}>
                Отмена
              </button>
              <button type="submit" className="btn btn--primary btn--plain">
                Сохранить
              </button>
            </div>
          </form>
        </Sheet>
      )}

      {dialog === 'undo' && (
        <Confirm
          title="Отменить действие?"
          text="Отмена вернёт игру в предыдущую фазу. Если там нужно что-то сказать игрокам, скажите это заново."
          okLabel="Отменить"
          onOk={() => {
            undo();
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}

      {dialog === 'rules' && (
        <Sheet title="Правила этой партии" onClose={() => setDialog(null)}>
          <p>{firstNightBrief(state.settings)}</p>
          {Object.entries(state.composition).filter(([, count]) => count > 0).map(([role]) => (
            <section key={role} className="host-role-brief">
              <h3>{ROLE_NAME[role as keyof typeof ROLE_NAME]}</h3>
              <RoleBrief role={role as keyof typeof ROLE_NAME} settings={state.settings} />
            </section>
          ))}
          <button type="button" className="btn btn--secondary" onClick={() => setDialog('menu')}>Назад в пульт</button>
        </Sheet>
      )}

      {dialog === 'draw' && (
        <Confirm
          title="Объявить ничью?"
          text="Игра закончится ничьей. Это можно отменить кнопкой «Отменить»."
          okLabel="Ничья"
          onOk={() => {
            dispatch({ type: 'EndGame', result: 'draw' });
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}

      {dialog === 'abort' && (
        <Confirm
          title="Прервать игру?"
          text="Игра закончится без победителя."
          okLabel="Прервать"
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
          title={dialog.cause === 'left' ? `№${dialog.confirmRemove.seat} покидает игру?` : `Удалить №${dialog.confirmRemove.seat}?`}
          text="Игрок выбывает сразу, без последнего слова."
          okLabel={dialog.cause === 'left' ? 'Покинул' : 'Удалить'}
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
