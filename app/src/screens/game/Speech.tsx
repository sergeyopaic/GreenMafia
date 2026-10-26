import { type Player, getCurrentSpeaker, getNominationOptions, playerHasAlibi } from '@greenmafia/engine';
import { useState } from 'react';
import { Chip, ChipGrid, MiniChip } from '../../components/Chip';
import { PlayerPicker } from '../../components/Sheet';
import { Timer } from '../../components/Timer';
import { TypeLine } from '../../components/TypeLine';
import { SCRIPT, seat } from '../../lib/text';
import { useApp, useGame } from '../../store';

function Speaker({ player, caption }: { player: Player; caption: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <Chip player={player} look={{ inert: true, speaker: true }} />
      <div>
        <div className="eyebrow">{caption}</div>
        <h2>{player.name}</h2>
      </div>
    </div>
  );
}

// ---------- Last words ----------

export function LastWordsScreen() {
  const state = useGame();
  const dispatch = useApp((s) => s.dispatch);
  if (state.phase.t !== 'lastWords') return null;
  const { queue, then, number } = state.phase;
  const player = state.players.find((p) => p.id === queue[0]);
  if (!player) return null;
  const more = queue.length > 1;

  return (
    <main className="screen">
      <Speaker player={player} caption={`последнее слово · №${player.seat}`} />
      <TypeLine text={SCRIPT.lastWord(player)} />
      <Timer key={`${number}-${player.id}`} seconds={state.settings.timers.lastWord} />
      <div className="actions">
        <button type="button" className="btn btn--primary btn--block" onClick={() => dispatch({ type: 'Proceed' })}>
          {more ? 'Следующее последнее слово' : then === 'discussion' ? 'К обсуждению' : 'Наступает ночь'}
        </button>
      </div>
    </main>
  );
}

// ---------- Discussion ----------

export function DiscussionScreen() {
  const state = useGame();
  const dispatch = useApp((s) => s.dispatch);
  const [picking, setPicking] = useState(false);
  if (state.phase.t !== 'discussion') return null;
  const day = state.days[state.days.length - 1];
  const speaker = getCurrentSpeaker(state);
  if (!day || !speaker) return null;

  const position = state.phase.index + 1;
  const isLast = day.order.slice(state.phase.index + 1).every((id) => !state.players.find((p) => p.id === id)?.alive);
  const nominated = day.nominations.find((n) => n.by === speaker.id);
  const candidates = day.nominations.map((n) => n.candidate);
  const byId = (id: string) => state.players.find((p) => p.id === id);
  const options = getNominationOptions(state);
  const anyAllowed = options.some((o) => o.allowed);

  return (
    <main className="screen">
      <Speaker player={speaker} caption={`речь ${position} из ${day.order.length} · №${speaker.seat}`} />
      <TypeLine text={SCRIPT.speech(speaker)} />
      <Timer key={`${day.number}-${speaker.id}`} seconds={state.settings.timers.speech} />

      <section className="folder">
        <span className="folder__tab">выставлены</span>
        {candidates.length === 0 ? (
          <p className="muted">Пока никого.</p>
        ) : (
          <div className="list">
            {day.nominations.map((n) => {
              const c = byId(n.candidate);
              const b = byId(n.by);
              if (!c || !b) return null;
              return (
                <div className="list__row" key={n.candidate} style={{ minHeight: 40, padding: '6px 0' }}>
                  <MiniChip player={c} />
                  <div className="list__main">
                    <span className="list__title">{c.name}</span>
                    <span className="list__sub"> · выставил {seat(b)}</span>
                  </div>
                  {!c.alive && <span className="list__sub">выбыл</span>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ChipGrid
        players={state.players}
        look={(p) => ({
          inert: true,
          speaker: p.id === speaker.id,
          candidate: candidates.includes(p.id),
          alibi: playerHasAlibi(state, p.id),
          tag: candidates.includes(p.id) ? 'выставлен' : playerHasAlibi(state, p.id) ? 'алиби' : '',
          badge: state.settings.fouls && p.fouls > 0 ? p.fouls : undefined,
          badgeTone: p.fouls >= 3 ? 'danger' : 'default',
        })}
      />

      <div className="actions">
        {nominated && <div className="actions__hint">{seat(speaker)} выставил {seat(byId(nominated.candidate)!)}</div>}
        <div className="actions__row">
          {!nominated && (
            <button type="button" className="btn btn--secondary" disabled={!anyAllowed} onClick={() => setPicking(true)}>
              Выставить…
            </button>
          )}
          <button type="button" className="btn btn--primary" onClick={() => dispatch({ type: 'Proceed' })}>
            {isLast ? 'Итоги обсуждения' : 'Следующий'}
          </button>
        </div>
      </div>

      {picking && (
        <PlayerPicker
          title={`${seat(speaker)} выставляет…`}
          hint="Кандидата можно выставить только во время своей речи, одного."
          players={state.players}
          allowed={(p) => options.find((o) => o.player.id === p.id)?.allowed ?? false}
          look={(p) => {
            const o = options.find((x) => x.player.id === p.id);
            const tag = !p.alive
              ? ''
              : candidates.includes(p.id)
                ? 'выставлен'
                : playerHasAlibi(state, p.id)
                  ? 'алиби'
                  : p.id === speaker.id && !o?.allowed
                    ? 'сам'
                    : '';
            return { tag };
          }}
          onPick={(p) => {
            dispatch({ type: 'Nominate', candidate: p.id });
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </main>
  );
}

// ---------- Defense ----------

export function DefenseScreen() {
  const state = useGame();
  const dispatch = useApp((s) => s.dispatch);
  if (state.phase.t !== 'defense') return null;
  const { queue, candidates, number } = state.phase;
  const player = state.players.find((p) => p.id === queue[0]);
  if (!player) return null;
  const first = queue.length === candidates.length;
  const tied = candidates.map((id) => state.players.find((p) => p.id === id)).filter((p): p is Player => !!p);
  const round = state.days[state.days.length - 1]?.rounds.length ?? 0;

  return (
    <main className="screen">
      <Speaker player={player} caption={`защитная речь · ${candidates.length - queue.length + 1} из ${candidates.length}`} />
      <TypeLine text={(first ? `${SCRIPT.voteTie(tied)} ` : '') + SCRIPT.defense(player)} />
      <Timer key={`${number}-${round}-${player.id}`} seconds={state.settings.timers.defense} />
      <div className="actions">
        <button type="button" className="btn btn--primary btn--block" onClick={() => dispatch({ type: 'Proceed' })}>
          {queue.length > 1 ? 'Следующая защита' : 'К переголосованию'}
        </button>
      </div>
    </main>
  );
}
