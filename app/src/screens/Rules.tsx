import { CLASSIC_SETTINGS, ROLES, ROLE_TEAM } from '@greenmafia/engine';
import { IconBack, RoleIcon } from '../components/icons';
import { RoleBrief } from '../components/RoleBrief';
import { firstNightBrief } from '../lib/roleBrief';
import { ROLE_NAME, TEAM_NAME } from '../lib/text';
import { useApp } from '../store';

export function RulesScreen() {
  const go = useApp((s) => s.go);
  const game = useApp((s) => s.game?.state);
  const settings = game?.settings ?? CLASSIC_SETTINGS;
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
      <p className="muted type">{game ? 'Правила текущей партии' : 'Классические правила · настройки можно изменить перед партией'}</p>

      <section className="folder">
        <span className="folder__tab">роли</span>
        {ROLES.map((r) => (
          <div className="role-line" key={r} style={{ alignItems: 'flex-start' }}>
            <RoleIcon role={r} className="role-line__icon" />
            <div className="list__main">
              <div className="list__title">
                {ROLE_NAME[r]} <span className="list__sub">· {TEAM_NAME[ROLE_TEAM[r]]}</span>
              </div>
              <RoleBrief role={r} settings={settings} />
            </div>
          </div>
        ))}
      </section>

      <section className="folder">
        <span className="folder__tab">ход игры</span>
        <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
          <li><b>Первая ночь.</b> {firstNightBrief(settings)}</li>
          <li>
            <b>Ночь.</b> Роли просыпаются по очереди: любовница, комиссар, доктор, мафия вместе с доном, дон отдельно, маньяк. К кому пришла любовница, тот этой ночью хода не делает. Все действия срабатывают
            одновременно, утром объявляют погибших — без имени убийцы.
          </li>
          <li>
            <b>День.</b> {settings.lastWordNight ? 'Погибшие говорят последнее слово. ' : ''}Затем каждый живой по кругу произносит речь и может выставить одного
            кандидата.
          </li>
          <li>
            <b>Голосование.</b> Уходит тот, у кого больше всего голосов.{' '}
            {settings.tieRule === 'nobody' ? 'При ничьей никто не выбывает.' : settings.tieRule === 'revoteThenNobody'
              ? 'При ничьей — защита и переголосование; при повторной ничьей никто не выбывает.'
              : 'При ничьей — защита и переголосование; при повторной ничьей решают, выгнать ли всех.'}
            {!settings.abstainAllowed && ' Воздерживаться нельзя: оставшиеся голоса получает последний кандидат.'}
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
            <b>Мафия</b> — когда маньяка нет, а мафиози не меньше, чем горожан.
            {settings.earlyWinDetection && ' При живом маньяке — если мафиози хотя бы на двоих больше горожан.'}
          </li>
          <li>
            <b>Маньяк</b> — когда мафии нет, а в живых он и не больше одного горожанина.
          </li>
          <li>
            <b>Ничья</b> — если погибли все{settings.earlyWinDetection && ' или остались один мафиози против маньяка'}.
          </li>
        </ul>
        <p className="list__sub" style={{ marginTop: 10 }}>Ведущий объявляет выбранные правила перед началом партии.</p>
      </section>

      <section className="folder">
        <span className="folder__tab">за игровым столом</span>
        <p>Раздайте карточки с номерами — можно случайно. Номер — только метка игрока и не меняется до конца партии; речи идут по порядку посадки за столом.</p>
        <a className="btn btn--secondary btn--block" href={`${import.meta.env.BASE_URL}print-kit.html`} target="_blank" rel="noreferrer">Номера 1–20 и памятка для печати</a>
      </section>
    </main>
  );
}
