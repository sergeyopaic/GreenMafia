import { useEffect, useRef, useState } from 'react';
import { play, vibrate } from '../lib/sound';
import { useT } from '../i18n';
import { useApp } from '../store';
import { IconRestart } from './icons';

function fmt(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Speech timer drawn as a burning fuse. Tap the digits to start / pause.
 * Re-mount with a new `key` to reset for the next speaker.
 */
export function Timer({ seconds, autoStart = false, label }: { seconds: number; autoStart?: boolean; label?: string }) {
  const total = seconds * 1000;
  const t = useT();
  const paused = useApp((s) => s.paused);
  const [left, setLeft] = useState(total);
  const [running, setRunning] = useState(autoStart);
  const last = useRef<number | null>(null);
  const lastWholeSecond = useRef<number>(seconds);

  const active = running && !paused && left > 0;

  useEffect(() => {
    if (!active) {
      last.current = null;
      return;
    }
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = last.current === null ? 0 : now - last.current;
      last.current = now;
      setLeft((l) => Math.max(0, l - dt));
    }, 200);
    return () => window.clearInterval(id);
  }, [active]);

  useEffect(() => {
    const whole = Math.ceil(left / 1000);
    if (whole === lastWholeSecond.current) return;
    lastWholeSecond.current = whole;
    if (!running) return;
    if (whole === 0) {
      play('time-up');
      vibrate([200, 100, 200]);
    } else if (whole <= 10) {
      play('tick', 0.4);
    }
  }, [left, running]);

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
        onClick={() => (over ? undefined : setRunning((r) => !r))}
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
              setLeft(total);
              setRunning(false);
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
