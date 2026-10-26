import { replay } from '@greenmafia/engine';
import { useEffect, useState } from 'react';
import { IconBack } from '../components/icons';
import { type SavedGame, loadHistory } from '../lib/storage';
import { RESULT_TITLE, plural } from '../lib/text';
import { useApp } from '../store';
import { CaseFile } from './game/GameOver';

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

export function HistoryScreen() {
  const go = useApp((s) => s.go);
  const [items, setItems] = useState<SavedGame[] | null>(null);

  useEffect(() => {
    void loadHistory().then(setItems);
  }, []);

  return (
    <main className="screen">
      <header className="topbar">
        <button type="button" className="icon-btn" onClick={() => go({ name: 'home' })} aria-label="Назад">
          <IconBack />
        </button>
        <div className="topbar__title">
          <b>Архив дел</b>
          <span>последние 50 игр</span>
        </div>
      </header>
      {items && items.length === 0 && <p className="hand" style={{ fontSize: 22 }}>Архив пуст. Сыграйте первую партию.</p>}
      <div className="list">
        {items?.map((g) => {
          const r = replay(g.events);
          if (!r.ok) return null;
          const s = r.value.state;
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
                <div className="list__title">{res ? RESULT_TITLE[res.winner] : 'Не окончена'}</div>
                <div className="list__sub">
                  {fmtDate(g.finishedAt ?? g.createdAt)} · {n} {plural(n, 'игрок', 'игрока', 'игроков')} · дней: {s.days.length}
                </div>
              </div>
              <span className="type muted">дело →</span>
            </button>
          );
        })}
      </div>
    </main>
  );
}

export function ArchiveScreen({ saved }: { saved: SavedGame }) {
  const go = useApp((s) => s.go);
  const r = replay(saved.events);
  return (
    <main className="screen">
      <header className="topbar">
        <button type="button" className="icon-btn" onClick={() => go({ name: 'history' })} aria-label="Назад">
          <IconBack />
        </button>
        <div className="topbar__title">
          <b>Дело от {fmtDate(saved.finishedAt ?? saved.createdAt)}</b>
          <span>из архива</span>
        </div>
      </header>
      {r.ok ? <CaseFile state={r.value.state} animate={false} /> : <p>Не удалось прочитать дело.</p>}
    </main>
  );
}
