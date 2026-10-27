import { type Player, replayTolerant } from '@greenmafia/engine';
import { useMemo } from 'react';
import { Chip } from '../components/Chip';
import { IconSound } from '../components/icons';
import { DICTS, LANGS, useT } from '../i18n';
import { phaseTitle } from '../lib/phase';
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
  const { go, resumable, resume, sound, toggleSound, lang, setLang } = useApp();
  const t = useT();

  const resumeInfo = useMemo(() => {
    if (!resumable) return null;
    const r = replayTolerant(resumable.events);
    if (!r.game) return null;
    const { title, sub } = phaseTitle(r.game.state, t);
    return `${title}, ${sub} · ${t.count.players(r.game.state.players.length)}`;
  }, [resumable, t]);

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
            {t.home.continue}
            {resumeInfo && <span className="btn__sub">{resumeInfo}</span>}
          </button>
        )}
        <button type="button" className={`btn btn--block ${resumable ? 'btn--secondary' : 'btn--primary'}`} onClick={() => go({ name: 'setup' })}>
          {t.home.newGame}
        </button>
        <button type="button" className="btn btn--secondary btn--block" onClick={() => go({ name: 'players' })}>
          {t.home.players}
        </button>
        <div className="actions__row">
          <button type="button" className="btn btn--secondary" onClick={() => go({ name: 'rules' })}>
            {t.home.rules}
          </button>
          <button type="button" className="btn btn--secondary" onClick={() => go({ name: 'history' })}>
            {t.home.history}
          </button>
        </div>
        <div className="home__footer">
          <button type="button" className="btn btn--ghost" onClick={toggleSound}>
            <IconSound off={!sound} width={18} height={18} /> {sound ? t.home.soundOn : t.home.soundOff}
          </button>
          <div className="lang-switch" role="group" aria-label={t.home.language}>
            {LANGS.map((l) => (
              <button type="button" key={l} aria-pressed={lang === l} onClick={() => setLang(l)} lang={l} title={DICTS[l].langName}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </nav>
    </main>
  );
}
