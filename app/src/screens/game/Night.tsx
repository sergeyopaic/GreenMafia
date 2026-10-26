import { type Player, getCommissarResult, getDonResult, getNightStepView } from '@greenmafia/engine';
import { useEffect, useState } from 'react';
import { Chip, ChipGrid } from '../../components/Chip';
import { RoleIcon } from '../../components/icons';
import { Stamp } from '../../components/Stamp';
import { TypeLine } from '../../components/TypeLine';
import { play } from '../../lib/sound';
import { SCRIPT, STEP_NAME, seat } from '../../lib/text';
import { useElapsed } from '../../lib/useElapsed';
import { useApp, useGame } from '../../store';

/** Short tag under a chip that cannot be chosen. */
function shortReason(reason: string | null, p: Player): string {
  if (!reason || !p.alive) return '';
  if (reason.includes('прошлой ночью')) return 'вчера';
  if (reason.includes('своего')) return 'свой';
  if (reason.includes('уже лечил себя') || reason.includes('не может лечить себя')) return 'лимит';
  if (reason.includes('себя')) return 'сам';
  return '';
}

/** "№1 (дон), №2" — the Don is marked so the host knows whose word decides. */
function actorList(actors: Player[]): string {
  return actors.map((p) => `${seat(p)}${p.role === 'don' ? ' (дон)' : ''}`).join(', ');
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
  const dispatch = useApp((s) => s.dispatch);
  const showToast = useApp((s) => s.showToast);
  const view = getNightStepView(state);
  const night = state.nights[state.nights.length - 1];
  const stepKey = `${night?.number}-${view?.index}`;
  const elapsed = useElapsed(stepKey);
  const [showCheck, setShowCheck] = useState(false);

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

  const wakeText =
    step === 'meeting'
      ? hasDon
        ? SCRIPT.meetingWithDon
        : SCRIPT.meetingWake
      : step === 'mafia' && hasDon
        ? SCRIPT.mafiaWithDon
        : SCRIPT.wake[step];
  const sleepText = step === 'meeting' ? SCRIPT.meetingSleep : SCRIPT.sleep[step];
  const lead = view.index === 0 ? `${SCRIPT.nightStart} ` : '';
  const checkResult = step === 'commissar' ? getCommissarResult(state) : null;
  const donCheck = step === 'don' ? getDonResult(state) : null;
  const canShowAnswer = !blocked && !!choice && ((step === 'commissar' && checkResult) || (step === 'don' && donCheck));

  const choose = (p: Player) => {
    const opt = view.options.find((o) => o.player.id === p.id);
    if (!opt) return;
    if (!opt.allowed) {
      if (opt.reason && !fake) showToast(opt.reason);
      return;
    }
    dispatch({ type: 'NightChoose', target: p.id });
  };

  return (
    <main className="screen">
      <nav className="steps" aria-label="Шаги ночи">
        {night.steps.map((s, i) => (
          <span key={s} className={`steps__item${i === view.index ? ' is-current' : i < view.index ? ' is-done' : ''}`}>
            {STEP_NAME[s]}
          </span>
        ))}
      </nav>

      <TypeLine text={lead + wakeText} />

      {step === 'meeting' && (
        <div className="notice notice--host">Мафия: {actorList(actors)}. Действий нет — пусть просто посмотрят друг на друга.</div>
      )}
      {step !== 'meeting' && fake && (
        <div className="notice notice--host">Роль выбыла. Произнесите текст и выдержите паузу, как обычно.</div>
      )}
      {step !== 'meeting' && !fake && !blocked && (
        <div className="notice notice--host">
          Просыпается: {actorList(actors)}
          {step === 'mafia' && actors.some((p) => p.role === 'don') && ' · решающее слово за доном'}
        </div>
      )}

      {step !== 'meeting' && blocked && (
        <section className="blocked-card" aria-live="polite">
          <RoleIcon role="lover" className="blocked-card__lover" />
          <div className="blocked-card__title">К {actors.length > 1 ? 'ним' : 'нему'} пришла любовница</div>
          <div className="blocked-card__chips">
            {actors.map((p) => (
              <Chip key={p.id} player={p} look={{ inert: true, actor: true }} />
            ))}
            <BigCross />
          </div>
          <p>
            Этой ночью {actorList(actors)} не {actors.length > 1 ? 'делают' : 'делает'} ход — выбора нет.
            {step === 'commissar' && ' Ответа комиссару не будет.'}
            {step === 'don' && ' Ответа дону не будет.'}
          </p>
          <p className="muted type" style={{ fontSize: 14 }}>
            Произнесите текст, выдержите паузу. Этот экран можно показать игроку.
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
              tag: actor ? 'ходит' : shortReason(opt?.reason ?? null, p),
            };
          }}
          onPick={choose}
        />
      )}

      <div className="actions">
        {canShowAnswer && (
          <button type="button" className="btn btn--accent btn--block" onClick={() => setShowCheck(true)}>
            {step === 'don' ? 'Показать ответ дону' : 'Показать ответ комиссару'}
          </button>
        )}
        {choice !== undefined || fake || blocked || step === 'meeting' ? (
          <div className="actions__hint">Скажите: «{sleepText}»</div>
        ) : null}
        <div className="actions__row">
          {step !== 'meeting' && !fake && !blocked && (
            <button
              type="button"
              className={`btn ${choice === null ? 'btn--primary btn--plain' : 'btn--secondary'}`}
              aria-pressed={choice === null}
              onClick={() => dispatch({ type: 'NightChoose', target: null })}
            >
              {step === 'mafia' ? 'Промах' : 'Пропуск'}
            </button>
          )}
          <button type="button" className="btn btn--primary" disabled={needsChoice || waitLeft > 0} onClick={() => dispatch({ type: 'Proceed' })}>
            {waitLeft > 0 ? `Пауза · ${waitLeft} с` : isLast ? 'Город просыпается' : `Дальше: ${nextStep ? STEP_NAME[nextStep] : ''}`}
          </button>
        </div>
      </div>

      {showCheck && step === 'commissar' && checkResult && (
        <div className="overlay check-response" onClick={() => setShowCheck(false)} role="dialog" aria-label="Ответ комиссару">
          <div className="eyebrow">ответ комиссару</div>
          <div className="answer-sheet">
            {checkResult === 'mafia' && <Stamp kind="checked-mafia" big silent rotate={-6} />}
            {checkResult === 'notMafia' && <Stamp kind="checked-clean" big silent rotate={-4} />}
            {checkResult === 'noAnswer' && <Stamp kind="no-answer" big silent rotate={-3} />}
          </div>
          <p className="muted type">Поверните экран к комиссару. Коснитесь, чтобы закрыть.</p>
        </div>
      )}
      {showCheck && step === 'don' && donCheck && (
        <div className="overlay check-response" onClick={() => setShowCheck(false)} role="dialog" aria-label="Ответ дону">
          <div className="eyebrow">ответ дону</div>
          <div className="answer-sheet">
            {donCheck === 'commissar' && <Stamp kind="checked-commissar" big silent rotate={-6} />}
            {donCheck === 'notCommissar' && <Stamp kind="checked-not-commissar" big silent rotate={-4} />}
            {donCheck === 'noAnswer' && <Stamp kind="no-answer" big silent rotate={-3} />}
          </div>
          <p className="muted type">Поверните экран к дону. Коснитесь, чтобы закрыть.</p>
        </div>
      )}
    </main>
  );
}
