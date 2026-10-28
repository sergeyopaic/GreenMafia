import { useEffect, useRef, useState } from 'react';
import { play, vibrate } from '../lib/sound';
import { useT } from '../i18n';
import { useApp } from '../store';
import { IconRestart } from './icons';
import { timerRemaining } from '../lib/gameRuntime';

function fmt(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Speech timer drawn as a burning fuse. Tap the digits to start / pause.
 * The phase-specific clock lives in the store and survives leaving the screen.
 */
export function Timer({ seconds, label }: { seconds: number; label?: string }) {
  const total = seconds * 1000;
  const t = useT();
  const paused = useApp((s) => s.paused);
  const timer = useApp((s) => s.runtime?.timer);
  const toggleTimer = useApp((s) => s.toggleTimer);
  const resetTimer = useApp((s) => s.resetTimer);
  const finishTimer = useApp((s) => s.finishTimer);
  const [now, setNow] = useState(Date.now());
  const left = timer ? timerRemaining(timer, Math.max(now, Date.now())) : total;
  const running = timer?.running ?? false;
  const lastWholeSecond = useRef(Math.ceil(left / 1000));

  const active = running && !paused && left > 0;

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [active]);

  useEffect(() => {
    const whole = Math.ceil(left / 1000);
    if (whole === lastWholeSecond.current) return;
    lastWholeSecond.current = whole;
    if (!running || paused) return;
    if (whole === 0) {
      play('time-up');
      vibrate([200, 100, 200]);
      finishTimer();
    } else if (whole <= 10) {
      play('tick', 0.4);
    }
  }, [left, running, paused, finishTimer]);

  const ratio = left / total;
  const low = left > 0 && left <= 10_000;
  const over = left <= 0;
  const state = over ? t.timer.over : running ? (paused ? t.timer.paused : t.timer.running) : left === total ? t.timer.start : t.timer.paused;

  return (
    <div className={`timer${running && !paused ? ' is-running' : ''}${low ? ' is-low' : ''}${over ? ' is-over' : ''}`}>
      {label && <div className="eyebrow center">{label}</div>}
      <button
        type="button"
        className="timer__face"
        onClick={() => (over ? undefined : toggleTimer())}
        aria-label={running ? t.timer.pauseAria : t.timer.startAria}
      >
        <span className="timer__digits">{fmt(left)}</span>
      </button>
      <div className="fuse" aria-hidden="true">
        <div className="fuse__burn" style={{ width: `${ratio * 100}%` }} />
        {left > 0 && <div className="fuse__spark" style={{ left: `${ratio * 100}%` }} />}
      </div>
      <div className="timer__tools">
        <span className="timer__state">{state}</span>
        {left !== total && (
          <button
            type="button"
            className="btn btn--ghost"
            style={{ minHeight: 0, padding: '0 6px' }}
            onClick={() => {
              resetTimer();
              lastWholeSecond.current = seconds;
            }}
          >
            <IconRestart width={14} height={14} /> {t.timer.restart}
          </button>
        )}
      </div>
    </div>
  );
}
