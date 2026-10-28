import { LanguageSwitch } from '../components/LanguageSwitch';
import { useT } from '../i18n';
import { useApp } from '../store';

/** A single, skippable page; revisiting it never creates a game or player data. */
export function WelcomeScreen() {
  const t = useT();
  const w = t.welcome;
  const finishIntro = useApp((s) => s.finishIntro);
  return (
    <main className="screen welcome" aria-labelledby="welcome-title">
      <header className="welcome__header">
        <span className="eyebrow">GreenMafia</span>
        <LanguageSwitch />
      </header>
      <div>
        <h1 id="welcome-title">{w.title}</h1>
        <p className="welcome__lead">{w.lead}</p>
      </div>
      <ol className="welcome__steps">
        {[w.table, w.setup, w.host].map((step) => (
          <li key={step.title}>
            <h2>{step.title}</h2>
            <p>{step.text}</p>
          </li>
        ))}
      </ol>
      <p className="welcome__offline">{w.offline}</p>
      <div className="actions">
        <button type="button" className="btn btn--primary btn--block" onClick={() => finishIntro('setup')}>{w.start}</button>
        <button type="button" className="btn btn--secondary btn--block" onClick={() => finishIntro('home')}>{w.home}</button>
      </div>
    </main>
  );
}
