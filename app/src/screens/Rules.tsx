import { CLASSIC_SETTINGS, ROLES, ROLE_TEAM } from '@greenmafia/engine';
import { IconBack, RoleIcon } from '../components/icons';
import { RoleBrief } from '../components/RoleBrief';
import { useT } from '../i18n';
import { firstNightBrief } from '../lib/roleBrief';
import { useApp } from '../store';

export function RulesScreen() {
  const go = useApp((s) => s.go);
  const t = useT();
  const r = t.rules;
  const game = useApp((s) => s.game?.state);
  const settings = game?.settings ?? CLASSIC_SETTINGS;
  return (
    <main className="screen">
      <header className="topbar">
        <button type="button" className="icon-btn" onClick={() => go({ name: 'home' })} aria-label={t.common.back}>
          <IconBack />
        </button>
        <div className="topbar__title">
          <b>{r.title}</b>
          <span>{r.sub}</span>
        </div>
      </header>
      <p className="muted type">{game ? r.current : r.classic}</p>

      <section className="folder">
        <span className="folder__tab">{r.roles}</span>
        {ROLES.map((role) => (
          <div className="role-line" key={role} style={{ alignItems: 'flex-start' }}>
            <RoleIcon role={role} className="role-line__icon" />
            <div className="list__main">
              <div className="list__title">
                {t.roles.name[role]} <span className="list__sub">· {t.roles.team[ROLE_TEAM[role]]}</span>
              </div>
              <RoleBrief role={role} settings={settings} />
            </div>
          </div>
        ))}
      </section>

      <section className="folder">
        <span className="folder__tab">{r.flow}</span>
        <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
          <li>
            <b>{r.firstNight}</b> {firstNightBrief(settings, t.code)}
          </li>
          <li>
            <b>{r.night}</b> {r.nightText}
          </li>
          <li>
            <b>{r.day}</b> {settings.lastWordNight ? r.dayLastWord : ''}
            {r.dayText}
          </li>
          <li>
            <b>{r.vote}</b> {r.voteText} {r.tie[settings.tieRule]}
            {!settings.abstainAllowed && r.noAbstain}
          </li>
        </ol>
      </section>

      <section className="folder">
        <span className="folder__tab">{r.who}</span>
        <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>
          <li>
            <b>{r.town}</b>
            {r.townText}
          </li>
          <li>
            <b>{r.mafia}</b>
            {r.mafiaText}
            {settings.earlyWinDetection && r.mafiaEarly}
          </li>
          <li>
            <b>{r.maniac}</b>
            {r.maniacText}
          </li>
          <li>
            <b>{r.draw}</b>
            {r.drawText}
            {settings.earlyWinDetection && r.drawEarly}.
          </li>
        </ul>
        <p className="list__sub" style={{ marginTop: 10 }}>
          {r.announce}
        </p>
      </section>

      <section className="folder">
        <span className="folder__tab">{r.table}</span>
        <p>{r.tableText}</p>
        <a className="btn btn--secondary btn--block" href={`${import.meta.env.BASE_URL}${r.printKitFile}`} target="_blank" rel="noreferrer">
          {r.printKit}
        </a>
      </section>
    </main>
  );
}
