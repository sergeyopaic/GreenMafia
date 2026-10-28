import { getDayOneOpener, getMorningReport } from '@greenmafia/engine';
import { useEffect, useState } from 'react';
import { Chip, MiniChip } from '../../components/Chip';
import { IdentityLine } from '../../components/Identity';
import { PlayerPicker } from '../../components/Sheet';
import { Stamp } from '../../components/Stamp';
import { TypeLine } from '../../components/TypeLine';
import { useT } from '../../i18n';
import { play } from '../../lib/sound';
import { useApp, useGame } from '../../store';

/** §7.5, §14.5 — the morning paper. */
export function MorningScreen() {
  const state = useGame();
  const t = useT();
  const m = t.morning;
  const dispatch = useApp((s) => s.dispatch);
  const report = getMorningReport(state);
  const opener = getDayOneOpener(state);
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    play('morning', 0.7);
  }, []);
  if (!report) return null;
  const deaths = report.deaths.map((d) => d.player);

  let headline: string;
  if (report.meeting) headline = m.headlineMeeting;
  else if (deaths.length === 0) headline = m.headlineQuiet;
  else if (deaths.length === 1) headline = m.headlineOne(deaths[0]!);
  else headline = m.headlineMany(deaths);

  const lines = [t.script.morningStart];
  if (!report.meeting) {
    if (deaths.length === 0) lines.push(t.script.deathsNone);
    else if (deaths.length === 1) lines.push(t.script.deathsOne(deaths[0]!));
    else lines.push(t.script.deathsMany(deaths));
    if (report.someoneSaved) lines.push(t.script.saved);
    if (report.alibi) lines.push(t.script.alibi(report.alibi));
  }

  const lastWords = state.settings.lastWordNight && deaths.length > 0;
  // One paragraph reads as a single column; two columns would split the sentence in half.
  const paragraphs = 1 + (report.alibi ? 1 : 0) + (report.someoneSaved ? 1 : 0);

  return (
    <main className="screen">
      <article className="paper">
        <div className="paper__mast">{m.mast}</div>
        <div className="paper__meta">
          <span>{m.edition}</span>
          <span>{m.day(report.number)}</span>
        </div>
        <h2 className="paper__headline">{headline}</h2>

        {deaths.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 28, flexWrap: 'wrap', padding: '6px 0' }}>
            {report.deaths.map(({ player }, i) => (
              <div key={player.id} className="hero-chip" style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
                <Chip player={player} look={{ inert: true }} />
                <div style={{ position: 'absolute', top: 14 }}>
                  <Stamp kind="killed" rotate={i % 2 ? 9 : -10} />
                </div>
                <div className="list__sub center" style={{ marginTop: 4 }}>
                  <IdentityLine state={state} playerId={player.id} />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={paragraphs > 1 ? 'paper__body' : 'paper__body paper__body--single'}>
          {report.meeting ? (
            <p>{m.meetingBody}</p>
          ) : deaths.length === 0 ? (
            <p>{m.quietBody}</p>
          ) : (
            <p>
              {m.deathsBody}
              {state.settings.lastWordNight && m.lastWordBody(deaths.length === 1)}
            </p>
          )}
          {report.alibi && (
            <p>
              <b>{m.alibiLead}</b>
              {m.alibiBody(report.alibi)}
            </p>
          )}
          {report.someoneSaved && <p>{m.savedBody}</p>}
        </div>
      </article>

      <TypeLine text={lines.join(' ')} />

      {state.pendingResult && <div className="notice">{m.overNote}</div>}

      {opener && (
        <section className="folder opener">
          <span className="folder__tab">{m.openerLabel}</span>
          <div className="opener__who">
            <MiniChip player={opener.opener} />
            <div>
              <b>{t.who(opener.opener)}</b>
              <div className="list__sub">{opener.chosen ? m.openerChosen : m.openerDefault}</div>
            </div>
          </div>
          {opener.order.length > 1 && <p className="list__sub">{m.openerOrder(t.nums(opener.order.slice(1)))}</p>}
          <button type="button" className="btn btn--secondary btn--block" onClick={() => setPicking(true)}>
            {m.openerChange}
          </button>
        </section>
      )}
      {opener && picking && (
        <PlayerPicker
          title={m.openerTitle}
          hint={m.openerHint}
          players={state.players}
          allowed={(p) => p.alive}
          look={(p) => ({ selected: p.id === opener.opener.id })}
          onPick={(p) => {
            if (dispatch({ type: 'ChooseFirstSpeaker', playerId: p.id })) setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}

      <div className="actions">
        <button type="button" className="btn btn--primary btn--block" onClick={() => dispatch({ type: 'Proceed' })}>
          {m.next(!!state.pendingResult, lastWords)}
        </button>
      </div>
    </main>
  );
}
