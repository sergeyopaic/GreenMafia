import { type Player, ROLE_TEAM, TEAM_NAME, undo as engineUndo } from '@greenmafia/engine';
import { useEffect, useState } from 'react';
import { phaseTitle } from '../lib/phase';
import { ROLE_NAME } from '../lib/text';
import { useApp, useGame } from '../store';
import { MiniChip } from './Chip';
import {
  IconBan,
  IconDoor,
  IconEye,
  IconFlag,
  IconHome,
  IconMenu,
  IconPause,
  IconPlay,
  IconScale,
  IconSound,
  IconStop,
  IconUndo,
  RoleIcon,
} from './icons';
import { Confirm, PlayerPicker, Sheet } from './Sheet';

type Dialog =
  | null
  | 'menu'
  | 'undo'
  | 'draw'
  | 'abort'
  | { pick: 'left' | 'removed' | 'foul' }
  | { confirmRemove: Player; cause: 'left' | 'removed' };

export function GameBar() {
  const state = useGame();
  const game = useApp((s) => s.game);
  const { dispatch, undo, paused, setPaused, closeGame, sound, toggleSound } = useApp();
  const [dialog, setDialog] = useState<Dialog>(null);
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
        <button type="button" className="icon-btn" onClick={() => setDialog('menu')} aria-label="Меню">
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
        <Sheet title="Меню ведущего" onClose={() => setDialog(null)}>
          <div className="list">
            {!over && !inReveal && (
              <>
                <button type="button" className="sheet__item" onClick={() => setDialog({ pick: 'left' })}>
                  <IconDoor /> Игрок покинул игру
                </button>
                <button type="button" className="sheet__item" onClick={() => setDialog({ pick: 'removed' })}>
                  <IconBan /> Удалить игрока за нарушение
                </button>
                {state.settings.fouls && (
                  <button type="button" className="sheet__item" onClick={() => setDialog({ pick: 'foul' })}>
                    <IconFlag /> Фол
                  </button>
                )}
              </>
            )}
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

      {dialog && typeof dialog === 'object' && 'pick' in dialog && (
        <PlayerPicker
          title={dialog.pick === 'foul' ? 'Кому фол?' : dialog.pick === 'left' ? 'Кто покинул игру?' : 'Кого удалить?'}
          players={state.players}
          allowed={(p) => p.alive}
          look={(p) => (state.settings.fouls && p.fouls > 0 ? { badge: p.fouls, badgeTone: p.fouls >= 3 ? 'danger' : 'default' } : {})}
          onPick={(p) => {
            if (dialog.pick === 'foul') {
              const ok = dispatch({ type: 'Foul', playerId: p.id });
              if (ok) useApp.getState().showToast(p.fouls + 1 >= 4 ? `№${p.seat} удалён (4-й фол)` : `Фол №${p.seat}: ${p.fouls + 1}`);
              setDialog(null);
            } else {
              setDialog({ confirmRemove: p, cause: dialog.pick });
            }
          }}
          onClose={() => setDialog(null)}
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
