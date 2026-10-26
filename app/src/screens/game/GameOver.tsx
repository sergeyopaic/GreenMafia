import { type GameState, ROLE_TEAM, getWinners } from '@greenmafia/engine';
import { useEffect, useState } from 'react';
import { Chronicle } from '../../components/Chronicle';
import { MiniChip } from '../../components/Chip';
import { RoleIcon } from '../../components/icons';
import { Stamp } from '../../components/Stamp';
import { play } from '../../lib/sound';
import { DEATH_CAUSE, RESULT_LINE, RESULT_TITLE, ROLE_NAME, TEAM_NAME } from '../../lib/text';
import { randomSeed, useApp, useGame } from '../../store';

/** Final report; also used read-only for archived games. */
export function CaseFile({ state, animate = true }: { state: GameState; animate?: boolean }) {
  const [tab, setTab] = useState<'roles' | 'chronicle'>('roles');
  if (state.phase.t !== 'gameOver') return null;
  const result = state.phase.result;
  const winners = new Set(getWinners(state).map((p) => p.id));

  return (
    <>
      <div className="closed">
        <Stamp kind="case-closed" big animate={animate} rotate={-6} />
        <div className="closed__title">{RESULT_TITLE[result.winner]}</div>
        <p className="muted">{RESULT_LINE[result.reason]}</p>
      </div>

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'roles'} onClick={() => setTab('roles')}>
          Роли
        </button>
        <button type="button" role="tab" aria-selected={tab === 'chronicle'} onClick={() => setTab('chronicle')}>
          Хроника
        </button>
      </div>

      {tab === 'roles' ? (
        <div className="list">
          {state.players.map((p) => (
            <div className={`list__row${winners.has(p.id) ? ' winner-row' : ''}`} key={p.id} style={{ paddingLeft: 6, paddingRight: 6 }}>
              <MiniChip player={p} />
              <div className="list__main">
                <div className="list__title">{p.name}</div>
                <div className="list__sub">
                  {TEAM_NAME[ROLE_TEAM[p.role]]}
                  {p.death ? ` · ${DEATH_CAUSE[p.death.cause]} (${p.death.phase === 'night' ? 'ночь' : 'день'} ${p.death.number})` : ' · дожил до конца'}
                </div>
              </div>
              <RoleIcon role={p.role} width={24} height={24} />
              <span style={{ minWidth: 92, textAlign: 'right' }}>{ROLE_NAME[p.role]}</span>
            </div>
          ))}
        </div>
      ) : (
        <Chronicle state={state} />
      )}
    </>
  );
}

export function GameOverScreen() {
  const state = useGame();
  const { startGame, closeGame, go } = useApp();

  useEffect(() => {
    if (state.phase.t !== 'gameOver') return;
    const w = state.phase.result.winner;
    if (w === 'town' || w === 'mafia' || w === 'maniac') play(`win-${w}`);
  }, [state.phase]);

  function playAgain() {
    const players = state.players.map((p) => ({ id: p.id, name: p.name }));
    if (state.dealing === 'app') {
      startGame({
        type: 'CreateGame',
        settings: state.settings,
        players,
        composition: state.composition,
        dealing: 'app',
        seed: randomSeed(),
      });
    } else {
      closeGame();
      go({ name: 'setup' });
    }
  }

  return (
    <main className="screen">
      <CaseFile state={state} />
      <div className="actions">
        <div className="actions__row">
          <button type="button" className="btn btn--secondary" onClick={closeGame}>
            На главную
          </button>
          <button type="button" className="btn btn--primary" onClick={playAgain}>
            Ещё раз
          </button>
        </div>
      </div>
    </main>
  );
}
