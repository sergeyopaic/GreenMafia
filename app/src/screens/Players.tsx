import { ROLES, ROLE_TEAM, type Team } from '@greenmafia/engine';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconBack, RoleIcon } from '../components/icons';
import { Confirm, Sheet } from '../components/Sheet';
import { type GameEntry, finishedGames, formatRate, playerStats } from '../lib/playerStats';
import { type PlayerProfile, MAX_NAME, cleanName, loadPlayers, makeProfile, nameError, savePlayers } from '../lib/players';
import { loadHistory } from '../lib/storage';
import { DEATH_CAUSE, ROLE_NAME, TEAM_NAME, plural } from '../lib/text';
import { useApp } from '../store';

/** Profiles plus finished games, loaded once per screen. */
function usePlayerBase() {
  const [profiles, setProfiles] = useState<PlayerProfile[] | null>(null);
  const [games, setGames] = useState<GameEntry[]>([]);

  useEffect(() => {
    void Promise.all([loadPlayers(), loadHistory()]).then(([p, h]) => {
      setProfiles(p);
      setGames(finishedGames(h));
    });
  }, []);

  const save = useCallback((next: PlayerProfile[]) => {
    setProfiles(next);
    void savePlayers(next);
  }, []);

  return { profiles, games, save };
}

function fmtDate(ts: number, withTime = false): string {
  return new Date(ts).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : { year: 'numeric' }),
  });
}

/** A casino chip with the player's initial. */
export function Avatar({ name, big }: { name: string; big?: boolean }) {
  return (
    <span className={`avatar${big ? ' avatar--big' : ''}`} aria-hidden="true">
      <span>{(name.trim()[0] ?? '?').toLocaleUpperCase('ru-RU')}</span>
    </span>
  );
}

// ---------- List ----------

export function PlayersScreen() {
  const go = useApp((s) => s.go);
  const { profiles, games, save } = usePlayerBase();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(
    () => (profiles ?? []).map((p) => ({ profile: p, stats: playerStats(p, games) })),
    [profiles, games],
  );

  if (!profiles) return null;

  function add() {
    if (!profiles) return;
    const err = nameError(profiles, draft);
    if (err) {
      setError(err);
      return;
    }
    save([...profiles, makeProfile(draft)]);
    setDraft('');
    setError(null);
  }

  return (
    <main className="screen">
      <header className="topbar">
        <button type="button" className="icon-btn" onClick={() => go({ name: 'home' })} aria-label="Назад">
          <IconBack />
        </button>
        <div className="topbar__title">
          <b>Игроки</b>
          <span>
            {profiles.length} {plural(profiles.length, 'игрок', 'игрока', 'игроков')} в базе
          </span>
        </div>
      </header>

      <form
        className="folder"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <span className="folder__tab">новый игрок</span>
        <div className="name-row">
          <input
            className="input"
            value={draft}
            maxLength={MAX_NAME}
            placeholder="Имя"
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            aria-label="Имя нового игрока"
          />
          <button type="submit" className="btn btn--secondary" disabled={!cleanName(draft)}>
            Добавить
          </button>
        </div>
        {error && <p className="notice notice--warn" style={{ marginTop: 10 }}>{error}</p>}
      </form>

      {rows.length === 0 && <p className="hand" style={{ fontSize: 22 }}>В базе пока никого нет.</p>}
      <div className="list">
        {rows.map(({ profile, stats }) => (
          <button type="button" key={profile.id} className="list__row player-row" onClick={() => go({ name: 'profile', id: profile.id })}>
            <Avatar name={profile.name} />
            <div className="list__main">
              <div className="list__title">{profile.name}</div>
              <div className="list__sub">
                {stats.games === 0
                  ? 'ещё не играл'
                  : `${stats.games} ${plural(stats.games, 'партия', 'партии', 'партий')} · ${stats.wins} ${plural(stats.wins, 'победа', 'победы', 'побед')}`}
              </div>
            </div>
            <span className="player-row__rate">{formatRate(stats.winRate)}</span>
          </button>
        ))}
      </div>
    </main>
  );
}

// ---------- Profile ----------

const TEAMS: Team[] = ['town', 'mafia', 'maniac'];

export function ProfileScreen({ id }: { id: string }) {
  const go = useApp((s) => s.go);
  const { profiles, games, save } = usePlayerBase();
  const [dialog, setDialog] = useState<null | 'rename' | 'delete'>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const profile = profiles?.find((p) => p.id === id);
  const stats = useMemo(() => (profile ? playerStats(profile, games) : null), [profile, games]);

  if (!profiles) return null;
  if (!profile || !stats) {
    return (
      <main className="screen">
        <p>Игрок не найден.</p>
        <button type="button" className="btn btn--secondary" onClick={() => go({ name: 'players' })}>
          К списку игроков
        </button>
      </main>
    );
  }

  function rename() {
    if (!profiles || !profile) return;
    const err = nameError(profiles, draft, profile.id);
    if (err) {
      setError(err);
      return;
    }
    save(profiles.map((p) => (p.id === profile.id ? { ...p, name: cleanName(draft) } : p)));
    setDialog(null);
  }

  const playedRoles = ROLES.filter((r) => stats.roles[r] > 0);

  return (
    <main className="screen">
      <header className="topbar">
        <button type="button" className="icon-btn" onClick={() => go({ name: 'players' })} aria-label="Назад">
          <IconBack />
        </button>
        <div className="topbar__title">
          <b>{profile.name}</b>
          <span>профиль игрока</span>
        </div>
      </header>

      <section className="profile-hero">
        <Avatar name={profile.name} big />
        <h1>{profile.name}</h1>
        <p className="muted type">в базе с {fmtDate(profile.createdAt)}</p>
      </section>

      <div className="stat-tiles">
        <div className="stat-tile">
          <b>{stats.games}</b>
          <span>{plural(stats.games, 'партия', 'партии', 'партий')}</span>
        </div>
        <div className="stat-tile">
          <b>{stats.wins}</b>
          <span>{plural(stats.wins, 'победа', 'победы', 'побед')}</span>
        </div>
        <div className="stat-tile">
          <b>{formatRate(stats.winRate)}</b>
          <span>побед</span>
        </div>
        <div className="stat-tile">
          <b>{stats.survived}</b>
          <span>дожил до конца</span>
        </div>
      </div>

      {stats.games === 0 ? (
        <p className="hand" style={{ fontSize: 21 }}>
          {profile.name} ещё не сыграл ни одной партии. Статистика появится после первой игры.
        </p>
      ) : (
        <>
          <section className="folder">
            <span className="folder__tab">по командам</span>
            <div className="list">
              {TEAMS.filter((t) => stats.byTeam[t].games > 0).map((t) => (
                <div className="list__row" key={t}>
                  <div className="list__main">
                    <div className="list__title">{TEAM_NAME[t]}</div>
                    <div className="list__sub">
                      {stats.byTeam[t].games} {plural(stats.byTeam[t].games, 'партия', 'партии', 'партий')} · {stats.byTeam[t].wins}{' '}
                      {plural(stats.byTeam[t].wins, 'победа', 'победы', 'побед')}
                    </div>
                  </div>
                  <span className="player-row__rate">{formatRate(stats.byTeam[t].wins / stats.byTeam[t].games)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="folder">
            <span className="folder__tab">роли</span>
            <div className="list">
              {playedRoles.map((r) => (
                <div className="role-line" key={r}>
                  <RoleIcon role={r} className="role-line__icon" />
                  <div className="role-line__name">
                    {ROLE_NAME[r]}
                    <div className="list__sub">
                      {TEAM_NAME[ROLE_TEAM[r]]}
                      {r === stats.favoriteRole && playedRoles.length > 1 ? ' · чаще всего' : ''}
                    </div>
                  </div>
                  <b className="player-row__rate">{stats.roles[r]}</b>
                </div>
              ))}
            </div>
          </section>

          <section className="folder">
            <span className="folder__tab">как выбывал</span>
            <div className="list">
              {[
                ['Дожил до конца', stats.survived],
                ['Убит ночью', stats.killedAtNight],
                ['Изгнан голосованием', stats.exiled],
                ['Удалён или ушёл', stats.removed],
              ].map(([label, n]) => (
                <div className="list__row" key={label} style={{ minHeight: 40, padding: '6px 0' }}>
                  <div className="list__main">{label}</div>
                  <b className="player-row__rate">{n}</b>
                </div>
              ))}
            </div>
          </section>

          <section className="folder">
            <span className="folder__tab">последние партии</span>
            <div className="list">
              {stats.history.slice(0, 15).map((h) => (
                <button
                  type="button"
                  key={h.saved.id}
                  className="list__row player-row"
                  onClick={() => go({ name: 'archive', game: h.saved, back: { name: 'profile', id } })}
                >
                  <RoleIcon role={h.role} width={26} height={26} />
                  <div className="list__main">
                    <div className="list__title">
                      {ROLE_NAME[h.role]} · №{h.seat}
                    </div>
                    <div className="list__sub">
                      {fmtDate(h.date, true)} · {h.survived ? 'дожил до конца' : DEATH_CAUSE[h.deathCause ?? ''] ?? 'выбыл'}
                    </div>
                  </div>
                  <span className={`result-tag${h.won ? ' result-tag--win' : h.result.winner === 'draw' ? '' : ' result-tag--loss'}`}>
                    {h.won ? 'победа' : h.result.winner === 'draw' ? 'ничья' : 'поражение'}
                  </span>
                </button>
              ))}
            </div>
            {stats.history.length > 15 && <p className="list__sub">И ещё {stats.history.length - 15} — в архиве.</p>}
          </section>
        </>
      )}

      <div className="actions">
        <div className="actions__row">
          <button type="button" className="btn btn--secondary" onClick={() => setDialog('delete')}>
            Удалить
          </button>
          <button
            type="button"
            className="btn btn--primary btn--plain"
            onClick={() => {
              setDraft(profile.name);
              setError(null);
              setDialog('rename');
            }}
          >
            Переименовать
          </button>
        </div>
      </div>

      {dialog === 'rename' && (
        <Sheet title="Новое имя" onClose={() => setDialog(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              rename();
            }}
            style={{ display: 'grid', gap: 12 }}
          >
            <input
              className="input"
              value={draft}
              maxLength={MAX_NAME}
              autoFocus
              onChange={(e) => {
                setDraft(e.target.value);
                setError(null);
              }}
              aria-label="Новое имя"
            />
            {error && <p className="notice notice--warn">{error}</p>}
            <p className="list__sub">Статистика сохранится: прошлые партии привязаны к профилю, а не к имени.</p>
            <div className="actions__row">
              <button type="button" className="btn btn--secondary" onClick={() => setDialog(null)}>
                Отмена
              </button>
              <button type="submit" className="btn btn--primary btn--plain">
                Сохранить
              </button>
            </div>
          </form>
        </Sheet>
      )}

      {dialog === 'delete' && (
        <Confirm
          title={`Удалить ${profile.name} из базы?`}
          text="Партии останутся в архиве, но статистика этого игрока пропадёт. Если потом добавить игрока с тем же именем, старые партии к нему не вернутся."
          okLabel="Удалить"
          danger
          onOk={() => {
            save(profiles.filter((p) => p.id !== profile.id));
            go({ name: 'players' });
          }}
          onCancel={() => setDialog(null)}
        />
      )}

    </main>
  );
}
