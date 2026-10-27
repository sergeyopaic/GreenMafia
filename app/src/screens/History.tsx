import { replayTolerant } from '@greenmafia/engine';
import { useEffect, useState } from 'react';
import { IconBack } from '../components/icons';
import { type SavedGame, loadHistory } from '../lib/storage';
import { type Dict, useT } from '../i18n';
import { type Screen, useApp } from '../store';
import { CaseFile } from './game/GameOver';

function fmtDate(ts: number, t: Dict): string {
  return new Date(ts).toLocaleString(t.locale, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

export function HistoryScreen() {
  const go = useApp((s) => s.go);
  const t = useT();
  const h = t.history;
  const [items, setItems] = useState<SavedGame[] | null>(null);

  useEffect(() => {
    void loadHistory().then(setItems);
  }, []);

  return (
    <main className="screen">
      <header className="topbar">
        <button type="button" className="icon-btn" onClick={() => go({ name: 'home' })} aria-label={t.common.back}>
          <IconBack />
        </button>
        <div className="topbar__title">
          <b>{h.title}</b>
          <span>{h.sub}</span>
        </div>
      </header>
      {items && items.length === 0 && <p className="hand" style={{ fontSize: 22 }}>{h.empty}</p>}
      <div className="list">
        {items?.map((g) => {
          const r = replayTolerant(g.events);
          if (!r.game) return null;
          const s = r.game.state;
          const res = s.phase.t === 'gameOver' ? s.phase.result : null;
          const n = s.players.length;
          return (
            <button
              type="button"
              key={g.id}
              className="list__row"
              style={{ border: 0, borderBottom: '1px solid var(--line)', background: 'none', textAlign: 'left', width: '100%' }}
              onClick={() => go({ name: 'archive', game: g })}
            >
              <div className="list__main">
                <div className="list__title">{res ? t.result.title[res.winner] : h.unfinished}</div>
                <div className="list__sub">
                  {fmtDate(g.finishedAt ?? g.createdAt, t)} · {t.count.players(n)} · {h.days(s.days.length)}
                </div>
              </div>
              <span className="type muted">{h.open}</span>
            </button>
          );
        })}
      </div>
    </main>
  );
}

export function ArchiveScreen({ saved, back }: { saved: SavedGame; back?: Screen }) {
  const go = useApp((s) => s.go);
  const t = useT();
  const r = replayTolerant(saved.events);
  return (
    <main className="screen">
      <header className="topbar">
        <button type="button" className="icon-btn" onClick={() => go(back ?? { name: 'history' })} aria-label={t.common.back}>
          <IconBack />
        </button>
        <div className="topbar__title">
          <b>{t.history.caseFrom(fmtDate(saved.finishedAt ?? saved.createdAt, t))}</b>
          <span>{t.history.fromArchive}</span>
        </div>
      </header>
      {r.game ? <CaseFile state={r.game.state} animate={false} /> : <p>{t.history.unreadable}</p>}
    </main>
  );
}
