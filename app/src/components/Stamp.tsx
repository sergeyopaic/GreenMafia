import { type CSSProperties, useEffect } from 'react';
import { type StampKind, stampImage } from '../lib/assets';
import { useT } from '../i18n';
import { play } from '../lib/sound';


/** Rubber stamp: image from assets/stamps/<kind>.* or a typeset stamp. */
export function Stamp({
  kind,
  big,
  rotate = -7,
  animate = true,
  text,
  silent = false,
}: {
  kind: StampKind;
  big?: boolean;
  rotate?: number;
  animate?: boolean;
  text?: string;
  silent?: boolean;
}) {
  useEffect(() => {
    if (animate && !silent) play('stamp', 0.6);
  }, [animate, silent]);

  const t = useT();
  const url = stampImage(kind, t.code);
  const style = { '--stamp-rot': `${rotate}deg` } as CSSProperties;
  if (url) {
    return <img className={`stamp-img${animate ? ' slam' : ''}`} style={style} src={url} alt={t.stamps[kind]} />;
  }
  const ok = kind === 'checked-clean' || kind === 'alibi' || kind === 'no-answer' || kind === 'checked-not-commissar';
  return (
    <span className={`stamp${big ? ' stamp--big' : ''}${ok ? ' stamp--ok' : ''}${animate ? ' slam' : ''}`} style={style}>
      {text ?? t.stamps[kind]}
    </span>
  );
}
