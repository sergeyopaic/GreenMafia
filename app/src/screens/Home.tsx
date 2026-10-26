import { type Player, replay } from '@greenmafia/engine';
import { useMemo } from 'react';
import { Chip } from '../components/Chip';
import { IconSound } from '../components/icons';
import { phaseTitle } from '../lib/phase';
import { plural } from '../lib/text';
import { useApp } from '../store';

const DECOR: Player[] = [7, 1, 3].map((seat) => ({
  id: `d${seat}`,
  seat,
  name: '',
  role: 'civilian',
  alive: true,
  death: null,
  fouls: 0,
  skipNextSpeech: false,
}));

export function HomeScreen() {
  const { go, resumable, resume, sound, toggleSound } = useApp();

  const resumeInfo = useMemo(() => {
    if (!resumable) return null;
    const r = replay(resumable.events);
    if (!r.ok) return null;
    const { title, sub } = phaseTitle(r.value.state);
    const n = r.value.state.players.length;
    return `${title}, ${sub} · ${n} ${plural(n, 'игрок', 'игрока', 'игроков')}`;
  }, [resumable]);

  return (
    <main className="home">
      <div className="sign">
        <div className="home__chips" aria-hidden="true">
          {DECOR.map((p) => (
            <Chip key={p.id} player={p} look={{ inert: true }} />
          ))}
        </div>
        <h1 className="sign__name">
          <img className="brand-mark" src={`${import.meta.env.BASE_URL}assets/brand/logo.svg`} alt="" />
          Green
          <em>Mafia</em>
        </h1>
      </div>

      <nav className="home__menu">
        {resumable && (
          <button type="button" className="btn btn--accent btn--block" onClick={resume} style={{ flexDirection: 'column', gap: 2 }}>
            Продолжить игру
            {resumeInfo && <span className="btn__sub">{resumeInfo}</span>}
          </button>
        )}
        <button type="button" className={`btn btn--block ${resumable ? 'btn--secondary' : 'btn--primary'}`} onClick={() => go({ name: 'setup' })}>
          Новая игра
        </button>
        <button type="button" className="btn btn--secondary btn--block" onClick={() => go({ name: 'players' })}>
          Игроки
        </button>
        <div className="actions__row">
          <button type="button" className="btn btn--secondary" onClick={() => go({ name: 'rules' })}>
            Правила
          </button>
          <button type="button" className="btn btn--secondary" onClick={() => go({ name: 'history' })}>
            История
          </button>
        </div>
        <button type="button" className="btn btn--ghost" onClick={toggleSound} style={{ alignSelf: 'center' }}>
          <IconSound off={!sound} width={18} height={18} /> звук {sound ? 'включён' : 'выключен'}
        </button>
      </nav>
    </main>
  );
}
