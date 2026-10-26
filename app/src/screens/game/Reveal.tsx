import { ROLE_TEAM, getRoleCard } from '@greenmafia/engine';
import { useEffect, useState } from 'react';
import { Chip } from '../../components/Chip';
import { RoleArt } from '../../components/RoleArt';
import { play } from '../../lib/sound';
import { ROLE_NAME, TEAM_NAME, seats } from '../../lib/text';
import { useApp, useGame } from '../../store';

/** §14.3 — the phone goes around; each player holds the envelope to see their role. */
export function RevealScreen() {
  const state = useGame();
  const dispatch = useApp((s) => s.dispatch);
  const ph = state.phase.t === 'reveal' ? state.phase : null;
  const [stage, setStage] = useState<'pass' | 'open'>('pass');
  const [holding, setHolding] = useState(false);
  const [seen, setSeen] = useState(false);

  const index = ph?.index ?? 0;
  useEffect(() => {
    setStage('pass');
    setSeen(false);
    setHolding(false);
  }, [index]);

  useEffect(() => {
    if (!holding) return;
    const up = () => setHolding(false);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', up);
    };
  }, [holding]);

  if (!ph) return null;
  const player = state.players[index];
  if (!player) return null;
  const card = getRoleCard(state, player.id);
  const last = index === state.players.length - 1;

  if (stage === 'pass') {
    return (
      <main className="screen" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
        <div className="eyebrow">передайте телефон</div>
        <div style={{ transform: 'scale(1.6)', margin: '24px 0 18px' }}>
          <Chip player={player} look={{ inert: true }} />
        </div>
        <h1>{player.name}</h1>
        <p className="muted type">Остальные — отвернитесь от экрана.</p>
        <div className="actions" style={{ width: '100%' }}>
          <button type="button" className="btn btn--primary btn--block" onClick={() => setStage('open')}>
            Это я, №{player.seat}
          </button>
        </div>
      </main>
    );
  }

  const open = holding;
  return (
    <main className="screen" style={{ alignItems: 'center' }}>
      <div className="eyebrow center">
        №{player.seat}, {player.name}
      </div>
      <div
        className={`envelope${open ? ' is-open' : ''}`}
        onPointerDown={(e) => {
          e.preventDefault();
          if (!holding) play('envelope', 0.5);
          setHolding(true);
          setSeen(true);
        }}
        onContextMenu={(e) => e.preventDefault()}
        role="button"
        aria-label="Удерживайте, чтобы увидеть роль"
      >
        <div className="envelope__card" aria-hidden={!open}>
          {open && card && (
            <div className="role-card">
              <div className="role-card__art">
                <RoleArt role={card.role} />
              </div>
              <div className="role-card__foot">
                <div className="role-card__name">{ROLE_NAME[card.role]}</div>
                <div className="role-card__team">команда: {TEAM_NAME[ROLE_TEAM[card.role]]}</div>
                {card.partners.length > 0 && (
                  <div className="role-card__partners">
                    Ваши сообщники: <b>{seats(card.partners)}</b>
                    <div className="list__sub">{card.partners.map((p) => p.name).join(', ')}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="envelope__body">
          <div className="envelope__flap" />
          <div className="envelope__seal">GM</div>
          <div className="envelope__hint">удерживайте, чтобы вскрыть</div>
        </div>
      </div>
      <p className="muted type center" style={{ fontSize: 14 }}>
        Отпустите — и карта спрячется.
      </p>
      <div className="actions" style={{ width: '100%' }}>
        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={!seen || holding}
          onClick={() => dispatch({ type: 'Proceed' })}
        >
          {last ? 'Запомнил(а) — раздача окончена' : 'Запомнил(а) — передать дальше'}
        </button>
      </div>
    </main>
  );
}
