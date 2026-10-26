import { useEffect, useState } from 'react';
import { useApp } from '../store';

/** Whole seconds since `key` last changed; stops while the game is paused. */
export function useElapsed(key: string): number {
  const paused = useApp((s) => s.paused);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
  }, [key]);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(id);
  }, [key, paused]);

  return elapsed;
}
