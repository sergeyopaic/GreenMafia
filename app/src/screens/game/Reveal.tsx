import { ROLE_TEAM, getRoleCard } from '@greenmafia/engine';
import { useEffect, useState } from 'react';
import { Chip } from '../../components/Chip';
import { RoleArt } from '../../components/RoleArt';
import { RoleBrief } from '../../components/RoleBrief';
import { play } from '../../lib/sound';
import { useT } from '../../i18n';
import { useApp, useGame } from '../../store';

/** §14.3 — the phone goes around; each player holds the envelope to see their role. */
export function RevealScreen() {
  const state = useGame();
  const t = useT();
  const r = t.reveal;
  const dispatch = useApp((s) => s.dispatch);
  const ph = state.phase.t === 'reveal' ? state.phase : null;
  const [stage, setStage] = useState<'pass' | 'open'>('pass');
  const holding = useApp((s) => s.secrets.role);
  const setHolding = (open: boolean) => useApp.getState().setSecret('role', open);
  const privacyEpoch = useApp((s) => s.privacyEpoch);
  const [seen, setSeen] = useState(false);
  const [detail, setDetail] = useState(false);

  const index = ph?.index ?? 0;
  useEffect(() => {
    setStage('pass');
    setSeen(false);
    setHolding(false);
    setDetail(false);
  }, [index, privacyEpoch]);

  useEffect(() => {
    if (!holding) return;
    const up = () => setHolding(false);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
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
        <div className="eyebrow">{r.pass}</div>
        <div style={{ transform: 'scale(1.6)', margin: '24px 0 18px' }}>
          <Chip player={player} look={{ inert: true }} />
        </div>
        <h1>{player.name}</h1>
        <p className="muted type">{r.turnAway}</p>
        <div className="actions" style={{ width: '100%' }}>
          <button type="button" className="btn btn--primary btn--block" onClick={() => setStage('open')}>
            {r.itsMe(player.seat)}
          </button>
        </div>
      </main>
    );
  }

  const open = holding;
  return (
    <main className="screen reveal-screen" style={{ alignItems: 'center' }}>
      <div className="eyebrow center">
        {t.who(player)}
      </div>
      <div
        className={`envelope${open ? ' is-open' : ''}${detail ? ' envelope--brief' : ''}`}
        onPointerDown={(e) => {
          if (detail && holding) return;
          e.preventDefault();
          if (!holding) play('envelope', 0.5);
          setHolding(true);
          setSeen(true);
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="envelope__card" aria-hidden={!open}>
          {open && card && (
            <div className="role-card">
              {!detail && <div className="role-card__art">
                <RoleArt role={card.role} />
              </div>}
              <div className="role-card__foot">
                <div className="role-card__name">{t.roles.name[card.role]}</div>
                <div className="role-card__team">{r.team(t.roles.team[ROLE_TEAM[card.role]])}</div>
                {detail && <RoleBrief role={card.role} settings={state.settings} firstNight />}
                {card.partners.length > 0 && (
                  <div className="role-card__partners">
                    {r.partners}{' '}
                    <b>{card.partners.map((p) => `${t.num(p.seat)}${p.role === 'don' ? t.roles.donMark : ''}`).join(', ')}</b>
                    <div className="list__sub">{card.partners.map((p) => p.name).join(', ')}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="envelope__body">
          <RoleArt role="back" />
          <div className="envelope__flap" />
          <div className="envelope__seal">GM</div>
          <div className="envelope__hint">{r.hint}</div>
        </div>
      </div>
      <div className="seg reveal-tabs" role="group" aria-label={r.viewAria}>
        <button type="button" aria-pressed={!detail} onClick={() => setDetail(false)}>{r.card}</button>
        <button type="button" aria-pressed={detail} onClick={() => setDetail(true)}>{r.brief}</button>
      </div>
      <button
        type="button"
        className="btn btn--secondary btn--block reveal-hold"
        onPointerDown={(e) => {
          e.preventDefault();
          if (!holding) play('envelope', 0.5);
          setHolding(true);
          setSeen(true);
        }}
        onKeyDown={(e) => {
          if (e.key !== ' ' && e.key !== 'Enter') return;
          e.preventDefault();
          setHolding(true);
          setSeen(true);
        }}
        onKeyUp={() => setHolding(false)}
        onBlur={() => setHolding(false)}
        onContextMenu={(e) => e.preventDefault()}
      >{r.hold(detail)}</button>
      <p className="muted type center" style={{ fontSize: 14 }}>
        {r.release(detail)}
      </p>
      <div className="actions" style={{ width: '100%' }}>
        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={!seen || holding}
          onClick={() => dispatch({ type: 'Proceed' })}
        >
          {r.done(last)}
        </button>
      </div>
    </main>
  );
}
