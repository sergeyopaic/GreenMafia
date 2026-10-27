import { type GameState, ROLE_TEAM, getWinners } from '@greenmafia/engine';
import { useEffect, useState } from 'react';
import { Chronicle } from '../../components/Chronicle';
import { MiniChip } from '../../components/Chip';
import { RoleIcon } from '../../components/icons';
import { Stamp } from '../../components/Stamp';
import { play } from '../../lib/sound';
import { useT } from '../../i18n';
import { randomSeed, useApp, useGame } from '../../store';

/** Final report; also used read-only for archived games. */
export function CaseFile({ state, animate = true }: { state: GameState; animate?: boolean }) {
  const t = useT();
  const [tab, setTab] = useState<'roles' | 'chronicle'>('roles');
  if (state.phase.t !== 'gameOver') return null;
  const result = state.phase.result;
  const winners = new Set(getWinners(state).map((p) => p.id));

  return (
    <>
      <div className="closed">
        <Stamp kind="case-closed" big animate={animate} rotate={-6} />
        <div className="closed__title">{t.result.title[result.winner]}</div>
        <p className="muted">{t.result.line[result.reason]}</p>
      </div>

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'roles'} onClick={() => setTab('roles')}>
          {t.gameOver.roles}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'chronicle'} onClick={() => setTab('chronicle')}>
          {t.gameOver.chronicle}
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
                  {t.roles.team[ROLE_TEAM[p.role]]}
                  {p.death ? ` · ${t.death[p.death.cause]} (${t.when(p.death.phase, p.death.number)})` : t.gameOver.survived}
                </div>
              </div>
              <RoleIcon role={p.role} width={24} height={24} />
              <span style={{ minWidth: 92, textAlign: 'right' }}>{t.roles.name[p.role]}</span>
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
  const t = useT();
  const { startGame, closeGame, go } = useApp();

  useEffect(() => {
    if (state.phase.t !== 'gameOver') return;
    const w = state.phase.result.winner;
    if (w === 'town' || w === 'mafia' || w === 'maniac') play(`win-${w}`);
  }, [state.phase]);

  function playAgain() {
    // Same people, same numbers, same seating; only the deal is new.
    const players = state.players.map((p) => ({ id: p.id, name: p.name, seat: p.seat }));
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
            {t.gameOver.home}
          </button>
          <button type="button" className="btn btn--primary" onClick={playAgain}>
            {t.gameOver.again}
          </button>
        </div>
      </div>
    </main>
  );
}
