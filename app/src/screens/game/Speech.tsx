import { type Player, getCurrentSpeaker, getNominationOptions, playerHasAlibi } from '@greenmafia/engine';
import { useState } from 'react';
import { Chip, ChipGrid, MiniChip } from '../../components/Chip';
import { PlayerPicker } from '../../components/Sheet';
import { Timer } from '../../components/Timer';
import { TypeLine } from '../../components/TypeLine';
import { useT } from '../../i18n';
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
  const t = useT();
  const dispatch = useApp((s) => s.dispatch);
  if (state.phase.t !== 'lastWords') return null;
  const { queue, then, number } = state.phase;
  const player = state.players.find((p) => p.id === queue[0]);
  if (!player) return null;
  const more = queue.length > 1;

  return (
    <main className="screen">
      <Speaker player={player} caption={t.speech.lastWordCaption(player.seat)} />
      <TypeLine text={t.script.lastWord(player)} />
      <Timer key={`${number}-${player.id}`} seconds={state.settings.timers.lastWord} />
      <div className="actions">
        <button type="button" className="btn btn--primary btn--block" onClick={() => dispatch({ type: 'Proceed' })}>
          {t.speech.lastWordNext(more, then === 'discussion')}
        </button>
      </div>
    </main>
  );
}

// ---------- Discussion ----------

export function DiscussionScreen() {
  const state = useGame();
  const t = useT();
  const sp = t.speech;
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
      <Speaker player={speaker} caption={sp.speechCaption(position, day.order.length, speaker.seat)} />
      <TypeLine text={t.script.speech(speaker)} />
      <Timer key={`${day.number}-${speaker.id}`} seconds={state.settings.timers.speech} />

      <section className="folder">
        <span className="folder__tab">{sp.nominated}</span>
        {candidates.length === 0 ? (
          <p className="muted">{sp.nobodyYet}</p>
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
                    <span className="list__sub">{sp.nominatedBy(b.seat)}</span>
                  </div>
                  {!c.alive && <span className="list__sub">{sp.out}</span>}
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
          tag: candidates.includes(p.id) ? sp.tagNominated : playerHasAlibi(state, p.id) ? sp.tagAlibi : '',
          badge: state.settings.fouls && p.fouls > 0 ? p.fouls : undefined,
          badgeTone: p.fouls >= 3 ? 'danger' : 'default',
        })}
      />

      <div className="actions">
        {nominated && <div className="actions__hint">{sp.didNominate(speaker.seat, byId(nominated.candidate)?.seat ?? 0)}</div>}
        <div className="actions__row">
          {!nominated && (
            <button type="button" className="btn btn--secondary" disabled={!anyAllowed} onClick={() => setPicking(true)}>
              {sp.nominate}
            </button>
          )}
          <button type="button" className="btn btn--primary" onClick={() => dispatch({ type: 'Proceed' })}>
            {sp.nextSpeaker(isLast)}
          </button>
        </div>
      </div>

      {picking && (
        <PlayerPicker
          title={sp.pickTitle(speaker.seat)}
          hint={sp.pickHint}
          players={state.players}
          allowed={(p) => options.find((o) => o.player.id === p.id)?.allowed ?? false}
          look={(p) => {
            const o = options.find((x) => x.player.id === p.id);
            const tag = !p.alive
              ? ''
              : candidates.includes(p.id)
                ? sp.tagNominated
                : playerHasAlibi(state, p.id)
                  ? sp.tagAlibi
                  : p.id === speaker.id && !o?.allowed
                    ? sp.tagSelf
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
  const t = useT();
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
      <Speaker player={player} caption={t.speech.defenseCaption(candidates.length - queue.length + 1, candidates.length)} />
      <TypeLine text={(first ? `${t.script.voteTie(tied)} ` : '') + t.script.defense(player)} />
      <Timer key={`${number}-${round}-${player.id}`} seconds={state.settings.timers.defense} />
      <div className="actions">
        <button type="button" className="btn btn--primary btn--block" onClick={() => dispatch({ type: 'Proceed' })}>
          {t.speech.defenseNext(queue.length > 1)}
        </button>
      </div>
    </main>
  );
}
