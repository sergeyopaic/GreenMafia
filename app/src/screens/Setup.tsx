import {
  CLASSIC_SETTINGS,
  type Composition,
  MAX_PLAYERS,
  MAX_SEAT,
  MIN_PLAYERS,
  PRESETS,
  type Player,
  type PresetName,
  ROLES,
  ROLE_TEAM,
  type Role,
  SINGLE_ROLES,
  type Settings,
  TEAM_NAME,
  emptyComposition,
  recommendedComposition,
  validateComposition,
} from '@greenmafia/engine';
import { useEffect, useMemo, useState } from 'react';
import { Chip, MiniChip } from '../components/Chip';
import { Sheet } from '../components/Sheet';
import { IconBack, RoleIcon } from '../components/icons';
import { type PlayerProfile, loadPlayers, normalizeName, resolveSeats, savePlayers } from '../lib/players';
import { type LastSetup, loadLastSetup, saveLastSetup } from '../lib/storage';
import { ROLE_NAME, SETTINGS_GROUPS, type SettingMeta, getSetting, plural, setSetting } from '../lib/text';
import { randomSeed, useApp } from '../store';

type Step = 0 | 1 | 2 | 3 | 4;
const STEP_TITLES = ['Игроки', 'Состав', 'Правила', 'Раздача', 'Карты'];

function resize(names: string[], n: number): string[] {
  return Array.from({ length: n }, (_, i) => names[i] ?? '');
}

/** Keeps the first `n` seat numbers; new places get the smallest free numbers. */
function resizeSeats(seats: number[], n: number): number[] {
  const kept = seats.slice(0, n);
  for (let k = 1; kept.length < n && k <= MAX_SEAT; k++) if (!kept.includes(k)) kept.push(k);
  return kept;
}

const seatsInOrder = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

function validSeats(seats: unknown, n: number): seats is number[] {
  return (
    Array.isArray(seats) &&
    seats.length === n &&
    seats.every((x) => Number.isInteger(x) && x >= 1 && x <= MAX_SEAT) &&
    new Set(seats).size === n
  );
}

function withCivilians(c: Composition, n: number): Composition {
  const others = c.mafia + c.don + c.commissar + c.doctor + c.lover + c.maniac;
  return { ...c, civilian: n - others };
}

/**
 * Civilians are never stored: they are always "players minus special roles".
 * Missing roles (e.g. a setup saved before the Don existed) count as zero.
 */
function normalizeComposition(c: Partial<Composition> | undefined, n: number): Composition {
  const base = emptyComposition();
  for (const r of ROLES) {
    const v = c?.[r];
    base[r] = typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0;
  }
  return withCivilians(base, n);
}

function samePreset(s: Settings): PresetName | 'custom' {
  for (const [name, preset] of Object.entries(PRESETS)) {
    if (JSON.stringify(preset) === JSON.stringify(s)) return name as PresetName;
  }
  return 'custom';
}

export function SetupScreen() {
  const { go, startGame } = useApp();
  const [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState<Step>(0);
  const [count, setCount] = useState(10);
  const [names, setNames] = useState<string[]>(resize([], 10));
  const [seatNums, setSeatNums] = useState<number[]>(seatsInOrder(10));
  const [compRaw, setComp] = useState<Composition>(recommendedComposition(10));
  const comp = useMemo(() => normalizeComposition(compRaw, count), [compRaw, count]);
  const [settings, setSettings] = useState<Settings>(CLASSIC_SETTINGS);
  const [dealing, setDealing] = useState<'app' | 'cards'>('app');
  const [cardRoles, setCardRoles] = useState<(Role | '')[]>([]);
  const [profiles, setProfiles] = useState<PlayerProfile[]>([]);

  useEffect(() => {
    void loadPlayers().then(setProfiles);
  }, []);

  useEffect(() => {
    void loadLastSetup().then((last) => {
      if (last) {
        const n = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, last.count));
        setCount(n);
        setNames(resize(last.names, n));
        setSeatNums(validSeats(last.seats, n) ? last.seats : seatsInOrder(n));
        setSettings({ ...CLASSIC_SETTINGS, ...last.settings, timers: { ...CLASSIC_SETTINGS.timers, ...last.settings.timers } });
        const saved = normalizeComposition(last.composition, n);
        setComp(validateComposition(n, saved).errors.length === 0 ? saved : recommendedComposition(n));
        setDealing(last.dealing);
      }
      setLoaded(true);
    });
  }, []);

  const check = useMemo(() => validateComposition(count, comp), [count, comp]);

  function changeCount(n: number) {
    const c = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, n));
    setCount(c);
    setNames((ns) => resize(ns, c));
    setSeatNums((ss) => resizeSeats(ss, c));
    setComp(recommendedComposition(c));
  }

  const players = names.map((name, i) => ({ id: `p${i + 1}`, name: name.trim() || `Игрок ${seatNums[i]}` }));

  /** Moves a person (name and number together) one place in the seating order. */
  function moveRow(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= names.length) return;
    const swap = <T,>(arr: T[]) => {
      const copy = [...arr];
      [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
      return copy;
    };
    setNames(swap(names));
    setSeatNums(swap(seatNums));
  }

  /** Gives `seat` to a row; numbers are unique, the picker never offers a taken one. */
  function setSeat(row: number, seat: number) {
    if (seatNums.some((x, j) => x === seat && j !== row)) return;
    setSeatNums(seatNums.map((x, j) => (j === row ? seat : x)));
  }

  /** Seats a profile in the first empty place (adding a place if needed) or frees its place. */
  function toggleProfile(p: PlayerProfile) {
    const key = normalizeName(p.name);
    const seated = names.findIndex((n) => normalizeName(n) === key);
    if (seated >= 0) {
      setNames(names.map((n, i) => (i === seated ? '' : n)));
      return;
    }
    const empty = names.findIndex((n) => !n.trim());
    if (empty >= 0) {
      setNames(names.map((n, i) => (i === empty ? p.name : n)));
    } else if (count < MAX_PLAYERS) {
      const n = count + 1;
      setCount(n);
      setNames([...names, p.name]);
      setSeatNums(resizeSeats(seatNums, n));
      setComp(recommendedComposition(n));
    } else {
      useApp.getState().showToast(`За столом уже ${MAX_PLAYERS} игроков`);
    }
  }

  const seats = useMemo(() => resolveSeats(names, profiles), [names, profiles]);

  function begin() {
    if (seats.error) {
      useApp.getState().showToast(seats.error);
      setStep(0);
      return;
    }
    if (seats.created.length > 0) {
      const next = [...profiles, ...seats.created];
      setProfiles(next);
      void savePlayers(next);
    }
    const event = {
      type: 'CreateGame' as const,
      settings,
      players: seats.players.map((pl, i) => ({ ...pl, seat: seatNums[i] })),
      composition: comp,
      dealing,
      ...(dealing === 'app' ? { seed: randomSeed() } : { roles: cardRoles as Role[] }),
    };
    const last: LastSetup = { names, seats: seatNums, count, preset: samePreset(settings), settings, composition: comp, dealing };
    void saveLastSetup(last);
    startGame(event);
  }

  const canNext =
    step === 0 ? seats.error === null : step === 1 ? check.errors.length === 0 : step === 4 ? cardsValid(cardRoles, comp, count) : true;

  function next() {
    if (step === 3) {
      if (dealing === 'app') begin();
      else {
        setCardRoles(Array<Role | ''>(count).fill(''));
        setStep(4);
      }
      return;
    }
    if (step === 4) {
      begin();
      return;
    }
    setStep((s) => (s + 1) as Step);
    window.scrollTo(0, 0);
  }

  function back() {
    if (step === 0) go({ name: 'home' });
    else setStep((s) => (s - 1) as Step);
    window.scrollTo(0, 0);
  }

  if (!loaded) return null;

  const total = dealing === 'cards' ? 5 : 4;

  return (
    <main className="screen">
      <header className="topbar">
        <button type="button" className="icon-btn" onClick={back} aria-label="Назад">
          <IconBack />
        </button>
        <div className="topbar__title">
          <b>{STEP_TITLES[step]}</b>
          <span>
            новое дело · шаг {step + 1} из {total}
          </span>
        </div>
      </header>
      <div className="wizard-steps" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i <= step ? 'is-on' : ''} />
        ))}
      </div>

      {step === 0 && (
        <PlayersStep
          count={count}
          names={names}
          seatNums={seatNums}
          onSeat={setSeat}
          onMove={moveRow}
          onResetSeats={() => setSeatNums(seatsInOrder(count))}
          onCount={changeCount}
          onNames={setNames}
          profiles={profiles}
          onToggle={toggleProfile}
          error={seats.error}
          newNames={seats.created.map((p) => p.name)}
        />
      )}
      {step === 1 && <CompositionStep count={count} comp={comp} onComp={(c) => setComp(withCivilians(c, count))} check={check} />}
      {step === 2 && <RulesStep settings={settings} onChange={setSettings} />}
      {step === 3 && <DealStep dealing={dealing} onDealing={setDealing} count={count} comp={comp} />}
      {step === 4 && <CardsStep names={players.map((p) => p.name)} seats={seatNums} roles={cardRoles} comp={comp} onRoles={setCardRoles} />}

      <div className="actions">
        <div className="actions__row">
          <button type="button" className="btn btn--secondary" onClick={back}>
            Назад
          </button>
          <button type="button" className="btn btn--primary" disabled={!canNext} onClick={next}>
            {step === 4 || (step === 3 && dealing === 'app') ? 'Начать игру' : 'Дальше'}
          </button>
        </div>
      </div>
    </main>
  );
}

// ---------- Step 1: players ----------

function PlayersStep({
  count,
  names,
  seatNums,
  onCount,
  onNames,
  onSeat,
  onMove,
  onResetSeats,
  profiles,
  onToggle,
  error,
  newNames,
}: {
  count: number;
  names: string[];
  seatNums: number[];
  onCount: (n: number) => void;
  onNames: (n: string[]) => void;
  onSeat: (row: number, seat: number) => void;
  onMove: (row: number, d: -1 | 1) => void;
  onResetSeats: () => void;
  profiles: PlayerProfile[];
  onToggle: (p: PlayerProfile) => void;
  error: string | null;
  newNames: string[];
}) {
  const seatedKeys = new Set(names.map(normalizeName).filter(Boolean));
  const [picking, setPicking] = useState<number | null>(null);
  const inOrder = seatNums.every((n, i) => n === i + 1);
  const label = (i: number) => names[i]?.trim() || `Игрок ${seatNums[i]}`;

  return (
    <>
      <section className="folder">
        <span className="folder__tab">состав стола</span>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h2>{count}</h2>
            <div className="muted">{plural(count, 'игрок', 'игрока', 'игроков')} за столом</div>
          </div>
          <div className="stepper">
            <button type="button" onClick={() => onCount(count - 1)} disabled={count <= MIN_PLAYERS} aria-label="Меньше">
              −
            </button>
            <button type="button" onClick={() => onCount(count + 1)} disabled={count >= MAX_PLAYERS} aria-label="Больше">
              +
            </button>
          </div>
        </div>
      </section>

      {profiles.length > 0 && (
        <section className="field">
          <div className="field__label">Из базы игроков — нажмите, чтобы посадить за стол</div>
          <div className="roster">
            {profiles.map((p) => (
              <button type="button" key={p.id} aria-pressed={seatedKeys.has(normalizeName(p.name))} onClick={() => onToggle(p)}>
                <span className="avatar" aria-hidden="true">
                  <span>{(p.name[0] ?? '?').toLocaleUpperCase('ru-RU')}</span>
                </span>
                {p.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="field">
        <div className="field__label">Порядок посадки по часовой стрелке · фишка — номер с карточки</div>
        {names.map((name, i) => (
          <div className="name-row" key={i}>
            <button
              type="button"
              className="seat-pick"
              onClick={() => setPicking(i)}
              aria-label={`Номер ${seatNums[i]} — сменить номер игрока ${label(i)}`}
            >
              <MiniChip player={{ seat: seatNums[i] ?? i + 1 }} />
            </button>
            <input
              className="input"
              value={name}
              placeholder={`Игрок ${seatNums[i]}`}
              maxLength={20}
              onChange={(e) => {
                const copy = [...names];
                copy[i] = e.target.value;
                onNames(copy);
              }}
              aria-label={`Имя игрока с номером ${seatNums[i]}`}
            />
            <div className="name-row__move">
              <button type="button" onClick={() => onMove(i, -1)} disabled={i === 0} aria-label="Выше">
                ↑
              </button>
              <button type="button" onClick={() => onMove(i, 1)} disabled={i === names.length - 1} aria-label="Ниже">
                ↓
              </button>
            </div>
          </div>
        ))}
        {error && <div className="notice notice--warn">{error}</div>}
        {!error && newNames.length > 0 && (
          <div className="notice">Новые в базе после старта: {newNames.join(', ')}.</div>
        )}
        <p className="list__sub">Речи идут по порядку посадки. Номер — только метка игрока: нажмите на фишку, чтобы выбрать его (1–20).</p>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn--ghost" onClick={() => onNames(names.map(() => ''))}>
            очистить имена
          </button>
          {!inOrder && (
            <button type="button" className="btn btn--ghost" onClick={onResetSeats}>
              номера по порядку 1–{count}
            </button>
          )}
        </div>
      </section>

      {picking !== null && (
        <SeatPicker
          title={`Номер: ${label(picking)}`}
          current={seatNums[picking] ?? 0}
          takenBy={(n) => {
            const row = seatNums.findIndex((x, j) => x === n && j !== picking);
            return row >= 0 ? label(row) : null;
          }}
          onPick={(n) => {
            onSeat(picking, n);
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </>
  );
}

/** Chips 1–20; numbers taken by other players cannot be chosen. */
function SeatPicker({
  title,
  current,
  takenBy,
  onPick,
  onClose,
}: {
  title: string;
  current: number;
  takenBy: (n: number) => string | null;
  onPick: (n: number) => void;
  onClose: () => void;
}) {
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="muted">Выберите номер, как на карточке игрока. Занятые номера недоступны.</p>
      <div className="chips chips--5 seat-grid" role="group" aria-label="Номера 1–20">
        {Array.from({ length: MAX_SEAT }, (_, k) => k + 1).map((n) => {
          const holder = takenBy(n);
          const chip: Player = { id: `seat${n}`, seat: n, name: '', role: 'civilian', alive: true, death: null, fouls: 0, skipNextSpeech: false };
          return (
            <Chip
              key={n}
              player={chip}
              look={{ selected: n === current, disabled: !!holder, inert: !!holder, tag: holder ?? (n === current ? 'сейчас' : '') }}
              onClick={() => onPick(n)}
            />
          );
        })}
      </div>
      <button type="button" className="btn btn--secondary" onClick={onClose}>
        Отмена
      </button>
    </Sheet>
  );
}

// ---------- Step 2: composition ----------

function CompositionStep({
  count,
  comp,
  onComp,
  check,
}: {
  count: number;
  comp: Composition;
  onComp: (c: Composition) => void;
  check: ReturnType<typeof validateComposition>;
}) {
  const editable: Role[] = ['mafia', 'don', 'commissar', 'doctor', 'lover', 'maniac'];
  const pin = check.balance === 'town' ? 18 : check.balance === 'mafia' ? 82 : 50;
  const isRecommended = JSON.stringify(comp) === JSON.stringify(recommendedComposition(count));

  return (
    <>
      <section className="folder">
        <span className="folder__tab">кто за столом</span>
        {[...editable, 'civilian' as Role].map((role) => {
          const max = (SINGLE_ROLES as readonly Role[]).includes(role) ? 1 : 6;
          // At least one member of the mafia team: a mafioso or the Don.
          const min = role === 'mafia' ? (comp.don > 0 ? 0 : 1) : role === 'don' ? (comp.mafia > 0 ? 0 : 1) : 0;
          return (
            <div className="role-line" key={role}>
              <RoleIcon role={role} className="role-line__icon" />
              <div className="role-line__name">
                {ROLE_NAME[role]}
                <div className="list__sub">{TEAM_NAME[ROLE_TEAM[role]]}</div>
              </div>
              {role === 'civilian' ? (
                <div className="stepper">
                  <output style={{ color: comp.civilian < 0 ? 'var(--danger)' : undefined }}>{comp.civilian}</output>
                </div>
              ) : (
                <div className="stepper">
                  <button type="button" disabled={comp[role] <= min} onClick={() => onComp({ ...comp, [role]: comp[role] - 1 })} aria-label="Меньше">
                    −
                  </button>
                  <output>{comp[role]}</output>
                  <button
                    type="button"
                    disabled={comp[role] >= max || comp.civilian <= 0}
                    onClick={() => onComp({ ...comp, [role]: comp[role] + 1 })}
                    aria-label="Больше"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </section>

      <div className="balance" aria-label="Баланс">
        <span>город</span>
        <div className="balance__scale">
          <div className="balance__pin" style={{ left: `${pin}%` }} />
        </div>
        <span>мафия</span>
      </div>
      <p className="center type muted" style={{ fontSize: 14 }}>
        {check.balance === 'balanced' ? 'Баланс в норме' : check.balance === 'town' ? 'Перевес города' : 'Перевес мафии'}
        {isRecommended ? ' · состав по таблице' : ''}
      </p>

      {check.errors.map((e) => (
        <div className="notice notice--warn" key={e.code}>
          {e.message}
        </div>
      ))}
      {check.warnings.map((w) => (
        <div className="notice" key={w.code}>
          {w.message}
        </div>
      ))}
      {!isRecommended && (
        <button type="button" className="btn btn--ghost" style={{ alignSelf: 'center' }} onClick={() => onComp(recommendedComposition(count))}>
          вернуть рекомендованный состав
        </button>
      )}
      <p className="hand" style={{ fontSize: 18 }}>
        Мирных считаю сам: все, кому не досталась особая роль.
      </p>
    </>
  );
}

// ---------- Step 3: rules ----------

function RulesStep({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const preset = samePreset(settings);
  return (
    <>
      <div className="field">
        <div className="field__label">Набор правил</div>
        <div className="seg" role="group">
          <button type="button" aria-pressed={preset === 'classic'} onClick={() => onChange(PRESETS.classic)}>
            Классика
          </button>
          <button type="button" aria-pressed={preset === 'sports'} onClick={() => onChange(PRESETS.sports)}>
            Спортивная
          </button>
          <button type="button" aria-pressed={preset === 'custom'} disabled>
            Своя
          </button>
        </div>
      </div>
      {SETTINGS_GROUPS.map((g) => (
        <section className="folder" key={g.title}>
          <span className="folder__tab">{g.title}</span>
          <div className="list">
            {g.items.map((m) => (
              <SettingRow key={m.path} meta={m} settings={settings} onChange={onChange} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function SettingRow({ meta, settings, onChange }: { meta: SettingMeta; settings: Settings; onChange: (s: Settings) => void }) {
  const value = getSetting(settings, meta.path);
  const set = (v: unknown) => onChange(setSetting(settings, meta.path, v));

  if (meta.kind === 'bool') {
    return (
      <div className="list__row">
        <div className="list__main">
          <div>{meta.label}</div>
          {meta.hint && <div className="list__sub">{meta.hint}</div>}
        </div>
        <button type="button" role="switch" className="switch" aria-checked={value === true} aria-label={meta.label} onClick={() => set(!value)} />
      </div>
    );
  }
  if (meta.kind === 'number') {
    const n = Number(value);
    return (
      <div className="list__row">
        <div className="list__main">
          <div>{meta.label}</div>
          {meta.hint && <div className="list__sub">{meta.hint}</div>}
        </div>
        <div className="stepper">
          <button type="button" disabled={n <= (meta.min ?? 0)} onClick={() => set(Math.max(meta.min ?? 0, n - (meta.step ?? 1)))} aria-label="Меньше">
            −
          </button>
          <output style={{ fontSize: 22, minWidth: 52 }}>
            {n}
            <small style={{ fontSize: 13 }}>{meta.unit}</small>
          </output>
          <button type="button" disabled={n >= (meta.max ?? 999)} onClick={() => set(Math.min(meta.max ?? 999, n + (meta.step ?? 1)))} aria-label="Больше">
            +
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="list__row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
      <div>
        <div>{meta.label}</div>
        {meta.hint && <div className="list__sub">{meta.hint}</div>}
      </div>
      <div className="seg" role="group" aria-label={meta.label}>
        {meta.choices?.map((c) => (
          <button type="button" key={String(c.value)} aria-pressed={value === c.value} onClick={() => set(c.value)}>
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Step 4: dealing ----------

function DealStep({
  dealing,
  onDealing,
  count,
  comp,
}: {
  dealing: 'app' | 'cards';
  onDealing: (d: 'app' | 'cards') => void;
  count: number;
  comp: Composition;
}) {
  const summary = ROLES.filter((r) => comp[r] > 0)
    .map((r) => (comp[r] > 1 || r === 'civilian' || r === 'mafia' ? `${ROLE_NAME[r].toLowerCase()} × ${comp[r]}` : ROLE_NAME[r].toLowerCase()))
    .join(', ');
  return (
    <>
      <button type="button" className="choice-card" aria-pressed={dealing === 'app'} onClick={() => onDealing('app')}>
        <RoleIcon role="mafia" width={36} height={36} />
        <div>
          <b>Приложение раздаст</b>
          <span>Телефон идёт по кругу. Каждый открывает свой конверт, видит роль и передаёт дальше.</span>
        </div>
      </button>
      <button type="button" className="choice-card" aria-pressed={dealing === 'cards'} onClick={() => onDealing('cards')}>
        <RoleIcon role="civilian" width={36} height={36} />
        <div>
          <b>Раздам картами сам</b>
          <span>Раздайте физические карты, а потом отметьте, у кого какая роль.</span>
        </div>
      </button>
      <section className="folder">
        <span className="folder__tab">итого</span>
        <p>
          <b>{count}</b> {plural(count, 'игрок', 'игрока', 'игроков')}: {summary}.
        </p>
      </section>
    </>
  );
}

// ---------- Step 5: physical cards ----------

function cardsValid(roles: (Role | '')[], comp: Composition, count: number): boolean {
  if (roles.length !== count || roles.some((r) => r === '')) return false;
  return ROLES.every((r) => roles.filter((x) => x === r).length === comp[r]);
}

function CardsStep({
  names,
  seats,
  roles,
  comp,
  onRoles,
}: {
  names: string[];
  seats: number[];
  roles: (Role | '')[];
  comp: Composition;
  onRoles: (r: (Role | '')[]) => void;
}) {
  const left = (r: Role) => comp[r] - roles.filter((x) => x === r).length;
  const special: Role[] = ROLES.filter((r) => r !== 'civilian' && comp[r] > 0);
  return (
    <>
      <p className="muted">Отметьте особые роли — всем остальным достанется «Мирный житель».</p>
      <div className="notice notice--host">Не показывайте этот экран игрокам.</div>
      <div className="list">
        {names.map((name, i) => (
          <div className="list__row" key={i} style={{ flexWrap: 'wrap' }}>
            <MiniChip player={{ seat: seats[i] ?? i + 1 }} />
            <div className="list__main">{name}</div>
            <select
              className="input"
              style={{ width: 'auto', fontFamily: 'var(--font-ui)', fontSize: 15 }}
              value={roles[i] ?? ''}
              onChange={(e) => {
                const copy = [...roles];
                copy[i] = e.target.value as Role | '';
                onRoles(copy);
              }}
              aria-label={`Роль игрока ${seats[i] ?? i + 1}`}
            >
              <option value="">—</option>
              {ROLES.map((r) => (
                <option key={r} value={r} disabled={comp[r] === 0 || (left(r) <= 0 && roles[i] !== r)}>
                  {ROLE_NAME[r]}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="btn btn--secondary"
        disabled={special.some((r) => left(r) > 0)}
        onClick={() => onRoles(roles.map((r) => (r === '' ? 'civilian' : r)))}
      >
        Остальные — мирные
      </button>
      <p className="list__sub">
        Осталось раздать:{' '}
        {ROLES.filter((r) => left(r) !== 0)
          .map((r) => `${ROLE_NAME[r].toLowerCase()} ${left(r)}`)
          .join(', ') || 'всё сходится'}
      </p>
    </>
  );
}
