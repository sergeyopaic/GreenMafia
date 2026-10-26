import { useEffect, useState } from 'react';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Narration printed like a typewriter; tap to show the whole line at once. */
export function TypeLine({ text, quiet }: { text: string; quiet?: boolean }) {
  const [n, setN] = useState(() => (reduced() ? text.length : 0));

  useEffect(() => {
    if (reduced()) {
      setN(text.length);
      return;
    }
    setN(0);
    const id = window.setInterval(() => {
      setN((x) => {
        if (x >= text.length) {
          window.clearInterval(id);
          return x;
        }
        return x + 1;
      });
    }, 24);
    return () => window.clearInterval(id);
  }, [text]);

  const done = n >= text.length;
  return (
    <div
      className={`script${quiet ? ' script--quiet' : ''}`}
      onClick={() => setN(text.length)}
      aria-live="polite"
      aria-label={text}
    >
      <span aria-hidden="true">
        {text.slice(0, n)}
        {!done && <span className="caret" />}
      </span>
    </div>
  );
}
