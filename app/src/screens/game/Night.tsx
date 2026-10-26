import { type ActionStep, type Player, getCommissarResult, getNightStepView } from '@greenmafia/engine';
import { useEffect, useState } from 'react';
import { ChipGrid } from '../../components/Chip';
import { Stamp } from '../../components/Stamp';
import { TypeLine } from '../../components/TypeLine';
import { play } from '../../lib/sound';
import { SCRIPT, STEP_NAME, seats } from '../../lib/text';
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
  const { step, fake, blocked, choice } = view;
  const isLast = view.index === view.total - 1;
  const waitLeft = Math.max(0, state.settings.minWakeSeconds - elapsed);
  const needsChoice = step !== 'meeting' && !fake && choice === undefined;
  const nextStep = night.steps[view.index + 1];

  const actors = state.players.filter((p) => p.alive && p.role === (step === 'meeting' ? 'mafia' : step));
  const wakeText = step === 'meeting' ? SCRIPT.meetingWake : SCRIPT.wake[step];
  const sleepText = step === 'meeting' ? SCRIPT.meetingSleep : SCRIPT.sleep[step];
  const lead = view.index === 0 ? `${SCRIPT.nightStart} ` : '';
  const checkResult = step === 'commissar' ? getCommissarResult(state) : null;

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
        <div className="notice notice--host">
          Мафия: {seats(actors)}. Действий нет — пусть просто посмотрят друг на друга.
        </div>
      )}
      {step !== 'meeting' && fake && (
        <div className="notice notice--host">Роль выбыла. Произнесите текст и выдержите паузу, как обычно.</div>
      )}
      {step !== 'meeting' && !fake && (
        <div className="notice notice--host">
          Просыпается: {seats(actors)}
          {blocked && ' · у него любовница — действие не сработает, но ведите себя как обычно'}
        </div>
      )}

      {step !== 'meeting' && (
        <ChipGrid
          players={state.players}
          look={(p) => {
            const opt = view.options.find((o) => o.player.id === p.id);
            return {
              selected: choice === p.id,
              disabled: !opt?.allowed,
              inert: fake || !p.alive,
              tag: shortReason(opt?.reason ?? null, p),
            };
          }}
          onPick={choose}
        />
      )}

      <div className="actions">
        {step === 'commissar' && choice && checkResult && (
          <button type="button" className="btn btn--accent btn--block" onClick={() => setShowCheck(true)}>
            Показать ответ комиссару
          </button>
        )}
        {choice !== undefined || fake || step === 'meeting' ? (
          <div className="actions__hint">Скажите: «{sleepText}»</div>
        ) : null}
        <div className="actions__row">
          {step !== 'meeting' && !fake && (
            <button
              type="button"
              className={`btn ${choice === null ? 'btn--primary btn--plain' : 'btn--secondary'}`}
              aria-pressed={choice === null}
              onClick={() => dispatch({ type: 'NightChoose', target: null })}
            >
              {(step as ActionStep) === 'mafia' ? 'Промах' : 'Пропуск'}
            </button>
          )}
          <button
            type="button"
            className="btn btn--primary"
            disabled={needsChoice || waitLeft > 0}
            onClick={() => {
              if (isLast) play('morning', 0.7);
              dispatch({ type: 'Proceed' });
            }}
          >
            {waitLeft > 0 ? `Пауза · ${waitLeft} с` : isLast ? 'Город просыпается' : `Дальше: ${nextStep ? STEP_NAME[nextStep] : ''}`}
          </button>
        </div>
      </div>

      {showCheck && checkResult && (
        <div className="overlay" onClick={() => setShowCheck(false)} role="dialog" aria-label="Ответ комиссару">
          <div className="eyebrow">ответ комиссару</div>
          {checkResult === 'mafia' && <Stamp kind="checked-mafia" big rotate={-6} />}
          {checkResult === 'notMafia' && <Stamp kind="checked-clean" big rotate={-4} />}
          {checkResult === 'noAnswer' && <Stamp kind="no-answer" big rotate={-3} />}
          <p className="muted type">Поверните экран к комиссару. Коснитесь, чтобы закрыть.</p>
        </div>
      )}
    </main>
  );
}
