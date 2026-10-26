import { ROLES, ROLE_TEAM } from '@greenmafia/engine';
import { IconBack, RoleIcon } from '../components/icons';
import { EXPECTED_ASSETS, asset } from '../lib/assets';
import { ROLE_BLURB, ROLE_NAME, TEAM_NAME } from '../lib/text';
import { useApp } from '../store';

export function RulesScreen() {
  const go = useApp((s) => s.go);
  return (
    <main className="screen">
      <header className="topbar">
        <button type="button" className="icon-btn" onClick={() => go({ name: 'home' })} aria-label="Назад">
          <IconBack />
        </button>
        <div className="topbar__title">
          <b>Правила</b>
          <span>коротко о главном</span>
        </div>
      </header>

      <section className="folder">
        <span className="folder__tab">роли</span>
        {ROLES.map((r) => (
          <div className="role-line" key={r} style={{ alignItems: 'flex-start' }}>
            <RoleIcon role={r} className="role-line__icon" />
            <div className="list__main">
              <div className="list__title">
                {ROLE_NAME[r]} <span className="list__sub">· {TEAM_NAME[ROLE_TEAM[r]]}</span>
              </div>
              <div className="list__sub">{ROLE_BLURB[r]}</div>
            </div>
          </div>
        ))}
      </section>

      <section className="folder">
        <span className="folder__tab">ход игры</span>
        <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
          <li>
            <b>Ночь.</b> Роли просыпаются по очереди: любовница, мафия, маньяк, доктор, комиссар. Все действия срабатывают
            одновременно, утром объявляют погибших — без имени убийцы.
          </li>
          <li>
            <b>День.</b> Погибшие говорят последнее слово. Затем каждый живой по кругу произносит речь и может выставить одного
            кандидата.
          </li>
          <li>
            <b>Голосование.</b> Уходит тот, у кого больше всего голосов. При ничьей — защитные речи и переголосование; если
            снова ничья — голосуют, выгнать ли всех.
          </li>
        </ol>
      </section>

      <section className="folder">
        <span className="folder__tab">кто побеждает</span>
        <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>
          <li>
            <b>Город</b> — когда не осталось ни мафии, ни маньяка.
          </li>
          <li>
            <b>Мафия</b> — когда её столько же, сколько остальных (и маньяка нет), или у неё явное большинство.
          </li>
          <li>
            <b>Маньяк</b> — когда мафии нет, а в живых он и не больше одного горожанина.
          </li>
          <li>
            <b>Ничья</b> — если погибли все или остались один мафиози против маньяка.
          </li>
        </ul>
        <p className="list__sub" style={{ marginTop: 10 }}>
          Все тонкости и настройки — в файле GAME_DESIGN.md проекта.
        </p>
      </section>

      <section className="folder">
        <span className="folder__tab">ассеты</span>
        <p className="list__sub" style={{ marginBottom: 6 }}>
          Положите файл в app/src/assets/ с указанным именем (webp, png или jpg) — заглушка заменится сама.
        </p>
        <div className="list">
          {EXPECTED_ASSETS.map((a) => (
            <div className="list__row" key={a.path} style={{ minHeight: 36, padding: '6px 0' }}>
              <div className="list__main">
                <div className="type" style={{ fontSize: 14 }}>
                  {a.path}
                </div>
                <div className="list__sub">{a.what}</div>
              </div>
              <span className="type" style={{ fontSize: 13, color: asset(a.path) ? 'var(--accent)' : 'var(--muted)' }}>
                {asset(a.path) ? 'есть' : 'заглушка'}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
