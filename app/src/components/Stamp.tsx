import { type CSSProperties, useEffect } from 'react';
import { type StampKind, stampImage } from '../lib/assets';
import { play } from '../lib/sound';

const TEXT: Record<StampKind, string> = {
  killed: 'Убит',
  exiled: 'Изгнан',
  alibi: 'Алиби',
  'case-closed': 'Дело закрыто',
  'checked-mafia': 'Мафия',
  'checked-clean': 'Не мафия',
  'no-answer': 'Нет ответа',
};

/** Rubber stamp: image from assets/stamps/<kind>.* or a typeset stamp. */
export function Stamp({
  kind,
  big,
  rotate = -7,
  animate = true,
  text,
}: {
  kind: StampKind;
  big?: boolean;
  rotate?: number;
  animate?: boolean;
  text?: string;
}) {
  useEffect(() => {
    if (animate) play('stamp', 0.6);
  }, [animate]);

  const url = stampImage(kind);
  const style = { '--stamp-rot': `${rotate}deg` } as CSSProperties;
  if (url) {
    return <img className={`stamp-img${animate ? ' slam' : ''}`} style={style} src={url} alt={TEXT[kind]} />;
  }
  const ok = kind === 'checked-clean' || kind === 'alibi' || kind === 'no-answer';
  return (
    <span className={`stamp${big ? ' stamp--big' : ''}${ok ? ' stamp--ok' : ''}${animate ? ' slam' : ''}`} style={style}>
      {text ?? TEXT[kind]}
    </span>
  );
}
