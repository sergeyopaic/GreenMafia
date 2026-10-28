import { type Player, type Reason, getCommissarResult, getDonResult, getNightStepView } from '@greenmafia/engine';
import { useEffect } from 'react';
import { Chip, ChipGrid } from '../../components/Chip';
import { RoleIcon } from '../../components/icons';
import { TypeLine } from '../../components/TypeLine';
import { play } from '../../lib/sound';
import { type Dict, reasonText, useT } from '../../i18n';
import { useElapsed } from '../../lib/useElapsed';
import { useApp, useGame } from '../../store';

/** Short tag under a chip that cannot be chosen ("last night", "self", "own"). */
function shortReason(t: Dict, reason: Reason | null, p: Player): string {
  if (!reason || !p.alive) return '';
  return t.night.tag[reason.code] ?? '';
}

/** "#1 (Don), #2" — the Don is marked so the host knows whose word decides. */
function actorList(t: Dict, actors: Player[]): string {
  return actors.map((p) => `${t.num(p.seat)}${p.role === 'don' ? t.roles.donMark : ''}`).join(', ');
}

function BigCross() {
  return (
    <svg className="blocked-card__cross" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path d="M8 8 92 92M92 8 8 92" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}

export function NightScreen() {
  const state = useGame();
  const t = useT();
  const n = t.night;
  const dispatch = useApp((s) => s.dispatch);
  const showToast = useApp((s) => s.showToast);
  const view = getNightStepView(state);
  const night = state.nights[state.nights.length - 1];
  const stepKey = `${night?.number}-${view?.index}`;
  const elapsed = useElapsed(stepKey);
  const showCheck = useApp((s) => s.secrets.answer);
  const setShowCheck = (open: boolean) => useApp.getState().setSecret('answer', open);

  useEffect(() => {
    setShowCheck(false);
    if (view?.index === 0) play('night-fall', 0.7);
  }, [stepKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!view || !night) return null;
  const { step, fake, blocked, choice, actors } = view;
  const isLast = view.index === view.total - 1;
  const waitLeft = Math.max(0, state.settings.minWakeSeconds - elapsed);
  const needsChoice = step !== 'meeting' && !fake && !blocked && choice === undefined;
  const nextStep = night.steps[view.index + 1];
  const hasDon = state.composition.don > 0;
  const actorIds = new Set(actors.map((p) => p.id));

  const sc = t.script;
  const wakeText =
    step === 'meeting' ? (hasDon ? sc.meetingWithDon : sc.meetingWake) : step === 'mafia' && hasDon ? sc.mafiaWithDon : sc.wake[step];
  const sleepText = step === 'meeting' ? sc.meetingSleep : sc.sleep[step];
  const lead = view.index === 0 ? `${sc.nightStart} ` : '';
  const checkResult = step === 'commissar' ? getCommissarResult(state) : null;
  const donCheck = step === 'don' ? getDonResult(state) : null;
  const canShowAnswer = !blocked && !!choice && ((step === 'commissar' && checkResult) || (step === 'don' && donCheck));

  const choose = (p: Player) => {
    const opt = view.options.find((o) => o.player.id === p.id);
    if (!opt) return;
    if (!opt.allowed) {
      if (opt.reason && !fake) showToast(reasonText(t, opt.reason));
      return;
    }
    dispatch({ type: 'NightChoose', target: p.id });
  };

  return (
    <main className="screen">
      <nav className="steps" aria-label={n.stepsAria}>
        {night.steps.map((s, i) => (
          <span key={s} className={`steps__item${i === view.index ? ' is-current' : i < view.index ? ' is-done' : ''}`}>
            {t.steps[s]}
          </span>
        ))}
      </nav>

      <TypeLine text={lead + wakeText} />

      {step === 'meeting' && (
        <div className="notice notice--host">{n.meetingNote(actorList(t, actors))}</div>
      )}
      {step !== 'meeting' && fake && (
        <div className="notice notice--host">{n.fakeNote}</div>
      )}
      {step !== 'meeting' && !fake && !blocked && (
        <div className="notice notice--host">
          {n.wakes(actorList(t, actors))}
          {step === 'mafia' && actors.some((p) => p.role === 'don') && n.donDecides}
        </div>
      )}

      {step !== 'meeting' && blocked && (
        <section className="blocked-card" aria-live="polite">
          <RoleIcon role="lover" className="blocked-card__lover" />
          <div className="blocked-card__title">{n.blockedTitle(actors.length > 1)}</div>
          <div className="blocked-card__chips">
            {actors.map((p) => (
              <Chip key={p.id} player={p} look={{ inert: true, actor: true }} />
            ))}
            <BigCross />
          </div>
          <p>
            {n.blockedText(actorList(t, actors), actors.length > 1)}
            {step === 'commissar' && n.noAnswerCommissar}
            {step === 'don' && n.noAnswerDon}
          </p>
          <p className="muted type" style={{ fontSize: 14 }}>
            {n.blockedHint}
          </p>
        </section>
      )}

      {step !== 'meeting' && !blocked && (
        <ChipGrid
          players={state.players}
          look={(p) => {
            const opt = view.options.find((o) => o.player.id === p.id);
            const actor = actorIds.has(p.id);
            return {
              selected: choice === p.id,
              actor,
              disabled: !opt?.allowed && !actor,
              inert: fake || !p.alive,
              tag: actor ? t.chip.acting : shortReason(t, opt?.reason ?? null, p),
            };
          }}
          onPick={choose}
        />
      )}

      <div className="actions">
        {canShowAnswer && (
          <button type="button" className="btn btn--accent btn--block" onClick={() => setShowCheck(true)}>
            {n.showAnswer(step === 'don')}
          </button>
        )}
        {choice !== undefined || fake || blocked || step === 'meeting' ? (
          <div className="actions__hint">{sc.say(sleepText)}</div>
        ) : null}
        <div className="actions__row">
          {step !== 'meeting' && !fake && !blocked && (
            <button
              type="button"
              className={`btn ${choice === null ? 'btn--primary btn--plain' : 'btn--secondary'}`}
              aria-pressed={choice === null}
              onClick={() => dispatch({ type: 'NightChoose', target: null })}
            >
              {step === 'mafia' ? n.miss : n.skip}
            </button>
          )}
          <button type="button" className="btn btn--primary" disabled={needsChoice || waitLeft > 0} onClick={() => dispatch({ type: 'Proceed' })}>
            {waitLeft > 0 ? n.wait(waitLeft) : isLast ? n.wakeUp : n.nextStep(nextStep ? t.steps[nextStep] : '')}
          </button>
        </div>
      </div>

      {showCheck && step === 'commissar' && checkResult && (
        <div className="overlay check-response" onClick={() => setShowCheck(false)} role="dialog" aria-label={n.answerCommissar}>
          <div className="eyebrow">{n.answerCommissar}</div>
          <div className="night-answer">
            {t.stamps[checkResult === 'mafia' ? 'checked-mafia' : checkResult === 'notMafia' ? 'checked-clean' : 'no-answer']}
          </div>
          <p className="muted type">{n.showToCommissar}</p>
        </div>
      )}
      {showCheck && step === 'don' && donCheck && (
        <div className="overlay check-response" onClick={() => setShowCheck(false)} role="dialog" aria-label={n.answerDon}>
          <div className="eyebrow">{n.answerDon}</div>
          <div className="night-answer">
            {t.stamps[donCheck === 'commissar' ? 'checked-commissar' : donCheck === 'notCommissar' ? 'checked-not-commissar' : 'no-answer']}
          </div>
          <p className="muted type">{n.showToDon}</p>
        </div>
      )}
    </main>
  );
}
