import { type Player, replayTolerant } from '@greenmafia/engine';
import { useMemo } from 'react';
import { Chip } from '../components/Chip';
import { IconSound } from '../components/icons';
import { useT } from '../i18n';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { phaseTitle } from '../lib/phase';
import { useApp } from '../store';
import { exportJson } from '../lib/exportData';

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
  const { go, resumable, resume, sound, toggleSound, currentRecovery, dataBusy } = useApp();
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
        {currentRecovery && <div className="recovery-notice" role="status">
          <b>{t.recovery.noticeTitle}</b>
          <p>{currentRecovery.kind === 'future' ? t.recovery.futureHint : currentRecovery.kind === 'invalid' ? t.recovery.invalidHint : currentRecovery.kind === 'partial' ? t.recovery.partialHint(currentRecovery.dropped) : t.recovery.migrationHint}</p>
          <p className="list__sub">{t.recovery.exportPrivacy}</p>
          <button type="button" className="btn btn--secondary" onClick={() => {
            try { exportJson(`greenmafia-original-${Date.now()}.json`, currentRecovery.original); }
            catch { useApp.getState().showToast(t.recovery.exportFailed); }
          }}>{t.recovery.exportOriginal}</button>
        </div>}
        {resumable && (
          <button type="button" className="btn btn--accent btn--block" disabled={dataBusy} onClick={() => void resume()} style={{ flexDirection: 'column', gap: 2 }}>
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
          <button type="button" className="btn btn--ghost" onClick={() => go({ name: 'settings' })}>{t.preferences.title}</button>
          <button type="button" className="btn btn--ghost" onClick={() => go({ name: 'welcome' })}>{t.home.howToPlay}</button>
          <button type="button" className="btn btn--ghost" onClick={toggleSound}>
            <IconSound off={!sound} width={18} height={18} /> {sound ? t.home.soundOn : t.home.soundOff}
          </button>
          <LanguageSwitch />
        </div>
      </nav>
    </main>
  );
}
