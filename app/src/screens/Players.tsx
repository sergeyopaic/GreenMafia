import { ROLES, ROLE_TEAM, type Team } from '@greenmafia/engine';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconBack, RoleIcon } from '../components/icons';
import { Confirm, Sheet } from '../components/Sheet';
import { type GameEntry, finishedGames, formatRate, playerStats } from '../lib/playerStats';
import { type PlayerProfile, MAX_NAME, cleanName, loadPlayers, makeProfile, nameError, savePlayers } from '../lib/players';
import { loadHistory } from '../lib/storage';
import { type Dict, useT } from '../i18n';
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

function fmtDate(ts: number, t: Dict, withTime = false): string {
  return new Date(ts).toLocaleString(t.locale, {
    day: 'numeric',
    month: 'long',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : { year: 'numeric' }),
  });
}

/** A casino chip with the player's initial. */
export function Avatar({ name, big }: { name: string; big?: boolean }) {
  return (
    <span className={`avatar${big ? ' avatar--big' : ''}`} aria-hidden="true">
      <span>{(name.trim()[0] ?? '?').toLocaleUpperCase()}</span>
    </span>
  );
}

// ---------- List ----------

export function PlayersScreen() {
  const go = useApp((s) => s.go);
  const tr = useT();
  const pt = tr.players;
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
    const err = nameError(profiles, draft, undefined, pt.errors);
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
        <button type="button" className="icon-btn" onClick={() => go({ name: 'home' })} aria-label={tr.common.back}>
          <IconBack />
        </button>
        <div className="topbar__title">
          <b>{pt.title}</b>
          <span>
            {pt.inBase(profiles.length)}
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
        <span className="folder__tab">{pt.newPlayer}</span>
        <div className="name-row">
          <input
            className="input"
            value={draft}
            maxLength={MAX_NAME}
            placeholder={tr.common.name}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            aria-label={pt.newAria}
          />
          <button type="submit" className="btn btn--secondary" disabled={!cleanName(draft)}>
            {pt.add}
          </button>
        </div>
        {error && <p className="notice notice--warn" style={{ marginTop: 10 }}>{error}</p>}
      </form>

      {rows.length === 0 && <p className="hand" style={{ fontSize: 22 }}>{pt.empty}</p>}
      <div className="list">
        {rows.map(({ profile, stats }) => (
          <button type="button" key={profile.id} className="list__row player-row" onClick={() => go({ name: 'profile', id: profile.id })}>
            <Avatar name={profile.name} />
            <div className="list__main">
              <div className="list__title">{profile.name}</div>
              <div className="list__sub">
                {stats.games === 0
                  ? pt.notPlayed
                  : `${tr.count.games(stats.games)} · ${tr.count.wins(stats.wins)}`}
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
  const tr = useT();
  const pt = tr.players;
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
        <p>{pt.notFound}</p>
        <button type="button" className="btn btn--secondary" onClick={() => go({ name: 'players' })}>
          {pt.toList}
        </button>
      </main>
    );
  }

  function rename() {
    if (!profiles || !profile) return;
    const err = nameError(profiles, draft, profile.id, pt.errors);
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
        <button type="button" className="icon-btn" onClick={() => go({ name: 'players' })} aria-label={tr.common.back}>
          <IconBack />
        </button>
        <div className="topbar__title">
          <b>{profile.name}</b>
          <span>{pt.profile}</span>
        </div>
      </header>

      <section className="profile-hero">
        <Avatar name={profile.name} big />
        <h1>{profile.name}</h1>
        <p className="muted type">{pt.since(fmtDate(profile.createdAt, tr))}</p>
      </section>

      <div className="stat-tiles">
        <div className="stat-tile">
          <b>{stats.games}</b>
          <span>{tr.count.gamesWord(stats.games)}</span>
        </div>
        <div className="stat-tile">
          <b>{stats.wins}</b>
          <span>{tr.count.winsWord(stats.wins)}</span>
        </div>
        <div className="stat-tile">
          <b>{formatRate(stats.winRate)}</b>
          <span>{pt.winRate}</span>
        </div>
        <div className="stat-tile">
          <b>{stats.survived}</b>
          <span>{pt.survived}</span>
        </div>
      </div>

      {stats.games === 0 ? (
        <p className="hand" style={{ fontSize: 21 }}>
          {pt.noGames(profile.name)}
        </p>
      ) : (
        <>
          <section className="folder">
            <span className="folder__tab">{pt.byTeam}</span>
            <div className="list">
              {TEAMS.filter((team) => stats.byTeam[team].games > 0).map((team) => (
                <div className="list__row" key={team}>
                  <div className="list__main">
                    <div className="list__title">{tr.roles.team[team]}</div>
                    <div className="list__sub">
                      {tr.count.games(stats.byTeam[team].games)} · {tr.count.wins(stats.byTeam[team].wins)}
                    </div>
                  </div>
                  <span className="player-row__rate">{formatRate(stats.byTeam[team].wins / stats.byTeam[team].games)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="folder">
            <span className="folder__tab">{pt.roles}</span>
            <div className="list">
              {playedRoles.map((r) => (
                <div className="role-line" key={r}>
                  <RoleIcon role={r} className="role-line__icon" />
                  <div className="role-line__name">
                    {tr.roles.name[r]}
                    <div className="list__sub">
                      {tr.roles.team[ROLE_TEAM[r]]}
                      {r === stats.favoriteRole && playedRoles.length > 1 ? pt.mostOften : ''}
                    </div>
                  </div>
                  <b className="player-row__rate">{stats.roles[r]}</b>
                </div>
              ))}
            </div>
          </section>

          <section className="folder">
            <span className="folder__tab">{pt.howOut}</span>
            <div className="list">
              {[
                [pt.outSurvived, stats.survived],
                [pt.outNight, stats.killedAtNight],
                [pt.outVote, stats.exiled],
                [pt.outRemoved, stats.removed],
              ].map(([label, n]) => (
                <div className="list__row" key={label} style={{ minHeight: 40, padding: '6px 0' }}>
                  <div className="list__main">{label}</div>
                  <b className="player-row__rate">{n}</b>
                </div>
              ))}
            </div>
          </section>

          <section className="folder">
            <span className="folder__tab">{pt.recent}</span>
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
                      {tr.roles.name[h.role]} · {tr.num(h.seat)}
                    </div>
                    <div className="list__sub">
                      {fmtDate(h.date, tr, true)} · {h.survived ? pt.survived : (h.deathCause ? tr.death[h.deathCause as keyof Dict['death']] : null) ?? tr.chip.out}
                    </div>
                  </div>
                  <span className={`result-tag${h.won ? ' result-tag--win' : h.result.winner === 'draw' ? '' : ' result-tag--loss'}`}>
                    {h.won ? pt.won : h.result.winner === 'draw' ? pt.draw : pt.lost}
                  </span>
                </button>
              ))}
            </div>
            {stats.history.length > 15 && <p className="list__sub">{pt.more(stats.history.length - 15)}</p>}
          </section>
        </>
      )}

      <div className="actions">
        <div className="actions__row">
          <button type="button" className="btn btn--secondary" onClick={() => setDialog('delete')}>
            {tr.common.delete}
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
            {pt.rename}
          </button>
        </div>
      </div>

      {dialog === 'rename' && (
        <Sheet title={pt.renameTitle} onClose={() => setDialog(null)}>
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
              aria-label={pt.renameTitle}
            />
            {error && <p className="notice notice--warn">{error}</p>}
            <p className="list__sub">{pt.renameNote}</p>
            <div className="actions__row">
              <button type="button" className="btn btn--secondary" onClick={() => setDialog(null)}>
                {tr.common.cancel}
              </button>
              <button type="submit" className="btn btn--primary btn--plain">
                {tr.common.save}
              </button>
            </div>
          </form>
        </Sheet>
      )}

      {dialog === 'delete' && (
        <Confirm
          title={pt.deleteTitle(profile.name)}
          text={pt.deleteText}
          okLabel={tr.common.delete}
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
