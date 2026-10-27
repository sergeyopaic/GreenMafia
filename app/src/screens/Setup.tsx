import {
  CLASSIC_SETTINGS,
  type Composition,
  MAX_PLAYERS,
  MAX_SEAT,
  MIN_PLAYERS,
  PRESETS,
  type PresetName,
  ROLES,
  ROLE_TEAM,
  type Role,
  SINGLE_ROLES,
  type Settings,
  emptyComposition,
  recommendedComposition,
  validateComposition,
} from '@greenmafia/engine';
import { useEffect, useMemo, useState } from 'react';
import { MiniChip } from '../components/Chip';
import { SeatPicker } from '../components/SeatPicker';
import { IconBack, RoleIcon } from '../components/icons';
import { type PlayerProfile, loadPlayers, normalizeName, resolveSeats, savePlayers } from '../lib/players';
import { type LastSetup, loadLastSetup, saveLastSetup } from '../lib/storage';
import { type SettingMeta, getSetting, setSetting, settingsGroups } from '../lib/text';
import { issueText, useT } from '../i18n';
import { randomSeed, useApp } from '../store';

type Step = 0 | 1 | 2 | 3 | 4;

function resize(names: string[], n: number): string[] {
  return Array.from({ length: n }, (_, i) => names[i] ?? '');
}

/** A seat number per row; `null` = no number yet (after "reset all numbers"). */
type SeatNum = number | null;

/** Keeps the first `n` seat numbers; new places get the smallest free numbers. */
function resizeSeats(seats: SeatNum[], n: number): SeatNum[] {
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
  const t = useT();
  const st = t.setup;
  const [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState<Step>(0);
  const [count, setCount] = useState(10);
  const [names, setNames] = useState<string[]>(resize([], 10));
  const [seatNums, setSeatNums] = useState<SeatNum[]>(seatsInOrder(10));
  const allSeated = seatNums.every((n) => n !== null);
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

  const players = names.map((name, i) => ({ id: `p${i + 1}`, name: name.trim() || t.defaultName(seatNums[i] ?? i + 1) }));

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
    if (seatNums.some((x, j) => x !== null && x === seat && j !== row)) return;
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
      useApp.getState().showToast(st.tableFull(MAX_PLAYERS));
    }
  }

  const seats = useMemo(() => resolveSeats(names, profiles, Date.now(), t.players.errors), [names, profiles, t]);

  function begin() {
    if (!allSeated) {
      useApp.getState().showToast(st.missingSeats);
      setStep(0);
      return;
    }
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
      players: seats.players.map((pl, i) => ({ ...pl, seat: seatNums[i] as number, name: pl.name || t.defaultName(seatNums[i] as number) })),
      composition: comp,
      dealing,
      ...(dealing === 'app' ? { seed: randomSeed() } : { roles: cardRoles as Role[] }),
    };
    const last: LastSetup = { names, seats: seatNums as number[], count, preset: samePreset(settings), settings, composition: comp, dealing };
    void saveLastSetup(last);
    startGame(event);
  }

  const canNext =
    step === 0 ? seats.error === null && allSeated : step === 1 ? check.errors.length === 0 : step === 4 ? cardsValid(cardRoles, comp, count) : true;

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
        <button type="button" className="icon-btn" onClick={back} aria-label={t.common.back}>
          <IconBack />
        </button>
        <div className="topbar__title">
          <b>{st.steps[step]}</b>
          <span>{st.sub(step + 1, total)}</span>
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
          onClearSeats={() => setSeatNums(seatNums.map(() => null))}
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
      {step === 4 && <CardsStep names={players.map((p) => p.name)} seats={seatNums as number[]} roles={cardRoles} comp={comp} onRoles={setCardRoles} />}

      <div className="actions">
        <div className="actions__row">
          <button type="button" className="btn btn--secondary" onClick={back}>
            {t.common.back}
          </button>
          <button type="button" className="btn btn--primary" disabled={!canNext} onClick={next}>
            {step === 4 || (step === 3 && dealing === 'app') ? st.start : t.common.next}
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
  onClearSeats,
  profiles,
  onToggle,
  error,
  newNames,
}: {
  count: number;
  names: string[];
  seatNums: SeatNum[];
  onCount: (n: number) => void;
  onNames: (n: string[]) => void;
  onSeat: (row: number, seat: number) => void;
  onMove: (row: number, d: -1 | 1) => void;
  onResetSeats: () => void;
  onClearSeats: () => void;
  profiles: PlayerProfile[];
  onToggle: (p: PlayerProfile) => void;
  error: string | null;
  newNames: string[];
}) {
  const t = useT();
  const st = t.setup;
  const seatedKeys = new Set(names.map(normalizeName).filter(Boolean));
  const [picking, setPicking] = useState<number | null>(null);
  const inOrder = seatNums.every((n, i) => n === i + 1);
  const label = (i: number) => names[i]?.trim() || (seatNums[i] ? t.defaultName(seatNums[i] as number) : st.place(i + 1));
  const missing = seatNums.map((n, i) => (n === null ? i : -1)).filter((i) => i >= 0);
  const anySeat = seatNums.some((n) => n !== null);

  return (
    <>
      <section className="folder">
        <span className="folder__tab">{st.table}</span>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h2>{count}</h2>
            <div className="muted">{st.atTable(count)}</div>
          </div>
          <div className="stepper">
            <button type="button" onClick={() => onCount(count - 1)} disabled={count <= MIN_PLAYERS} aria-label={t.common.less}>
              −
            </button>
            <button type="button" onClick={() => onCount(count + 1)} disabled={count >= MAX_PLAYERS} aria-label={t.common.more}>
              +
            </button>
          </div>
        </div>
      </section>

      {profiles.length > 0 && (
        <section className="field">
          <div className="field__label">{st.fromBase}</div>
          <div className="roster">
            {profiles.map((p) => (
              <button type="button" key={p.id} aria-pressed={seatedKeys.has(normalizeName(p.name))} onClick={() => onToggle(p)}>
                <span className="avatar" aria-hidden="true">
                  <span>{(p.name[0] ?? '?').toLocaleUpperCase()}</span>
                </span>
                {p.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="field">
        <div className="field__label">{st.seatingLabel}</div>
        {names.map((name, i) => (
          <div className="name-row" key={i}>
            <button
              type="button"
              className="seat-pick"
              onClick={() => setPicking(i)}
              aria-label={seatNums[i] ? st.seatAria(seatNums[i] as number, label(i)) : st.pickSeatAria(label(i))}
            >
              {seatNums[i] ? (
                <MiniChip player={{ seat: seatNums[i] as number }} />
              ) : (
                <span className="mini-chip mini-chip--empty">
                  <span>?</span>
                </span>
              )}
            </button>
            <input
              className="input"
              value={name}
              placeholder={seatNums[i] ? t.defaultName(seatNums[i] as number) : t.common.name}
              maxLength={20}
              onChange={(e) => {
                const copy = [...names];
                copy[i] = e.target.value;
                onNames(copy);
              }}
              aria-label={st.nameAria(seatNums[i] ?? null, i + 1)}
            />
            <div className="name-row__move">
              <button type="button" onClick={() => onMove(i, -1)} disabled={i === 0} aria-label={t.common.up}>
                ↑
              </button>
              <button type="button" onClick={() => onMove(i, 1)} disabled={i === names.length - 1} aria-label={t.common.down}>
                ↓
              </button>
            </div>
          </div>
        ))}
        {error && <div className="notice notice--warn">{error}</div>}
        {missing.length > 0 && (
          <div className="notice notice--warn">
            {st.noSeat(missing.map(label).join(', '))}
          </div>
        )}
        {!error && newNames.length > 0 && (
          <div className="notice">{st.newInBase(newNames.join(', '))}</div>
        )}
        <p className="list__sub">{st.seatingHint}</p>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn--ghost" onClick={() => onNames(names.map(() => ''))}>
            {st.clearNames}
          </button>
          {anySeat && (
            <button type="button" className="btn btn--ghost" onClick={onClearSeats}>
              {st.clearSeats}
            </button>
          )}
          {!inOrder && (
            <button type="button" className="btn btn--ghost" onClick={onResetSeats}>
              {st.seatsInOrder(count)}
            </button>
          )}
        </div>
      </section>

      {picking !== null && (
        <SeatPicker
          title={st.seatTitle(label(picking))}
          current={seatNums[picking] ?? 0}
          takenBy={(n) => {
            const row = seatNums.findIndex((x, j) => x === n && j !== picking);
            return row >= 0 ? label(row) : null;
          }}
          onPick={(n) => {
            const wasEmpty = seatNums[picking] === null;
            onSeat(picking, n);
            // Handing out numbers after a reset: go straight to the next player without a number.
            const next = wasEmpty ? missing.find((i) => i > picking) ?? missing.find((i) => i !== picking) : undefined;
            setPicking(next ?? null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </>
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
  const t = useT();
  const st = t.setup;
  const editable: Role[] = ['mafia', 'don', 'commissar', 'doctor', 'lover', 'maniac'];
  const pin = check.balance === 'town' ? 18 : check.balance === 'mafia' ? 82 : 50;
  const isRecommended = JSON.stringify(comp) === JSON.stringify(recommendedComposition(count));

  return (
    <>
      <section className="folder">
        <span className="folder__tab">{st.who}</span>
        {[...editable, 'civilian' as Role].map((role) => {
          const max = (SINGLE_ROLES as readonly Role[]).includes(role) ? 1 : 6;
          // At least one member of the mafia team: a mafioso or the Don.
          const min = role === 'mafia' ? (comp.don > 0 ? 0 : 1) : role === 'don' ? (comp.mafia > 0 ? 0 : 1) : 0;
          return (
            <div className="role-line" key={role}>
              <RoleIcon role={role} className="role-line__icon" />
              <div className="role-line__name">
                {t.roles.name[role]}
                <div className="list__sub">{t.roles.team[ROLE_TEAM[role]]}</div>
              </div>
              {role === 'civilian' ? (
                <div className="stepper">
                  <output style={{ color: comp.civilian < 0 ? 'var(--danger)' : undefined }}>{comp.civilian}</output>
                </div>
              ) : (
                <div className="stepper">
                  <button type="button" disabled={comp[role] <= min} onClick={() => onComp({ ...comp, [role]: comp[role] - 1 })} aria-label={t.common.less}>
                    −
                  </button>
                  <output>{comp[role]}</output>
                  <button
                    type="button"
                    disabled={comp[role] >= max || comp.civilian <= 0}
                    onClick={() => onComp({ ...comp, [role]: comp[role] + 1 })}
                    aria-label={t.common.more}
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </section>

      <div className="balance" aria-label={st.balanceAria}>
        <span>{st.balanceTown}</span>
        <div className="balance__scale">
          <div className="balance__pin" style={{ left: `${pin}%` }} />
        </div>
        <span>{st.balanceMafia}</span>
      </div>
      <p className="center type muted" style={{ fontSize: 14 }}>
        {st.balance[check.balance]}
        {isRecommended ? st.byTable : ''}
      </p>

      {check.errors.map((e) => (
        <div className="notice notice--warn" key={e.code}>
          {issueText(t, e)}
        </div>
      ))}
      {check.warnings.map((w) => (
        <div className="notice" key={w.code}>
          {issueText(t, w)}
        </div>
      ))}
      {!isRecommended && (
        <button type="button" className="btn btn--ghost" style={{ alignSelf: 'center' }} onClick={() => onComp(recommendedComposition(count))}>
          {st.resetComposition}
        </button>
      )}
      <p className="hand" style={{ fontSize: 18 }}>
        {st.civiliansNote}
      </p>
    </>
  );
}

// ---------- Step 3: rules ----------

function RulesStep({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const t = useT();
  const st = t.setup;
  const preset = samePreset(settings);
  return (
    <>
      <div className="field">
        <div className="field__label">{st.ruleSet}</div>
        <div className="seg" role="group">
          <button type="button" aria-pressed={preset === 'classic'} onClick={() => onChange(PRESETS.classic)}>
            {st.presets.classic}
          </button>
          <button type="button" aria-pressed={preset === 'sports'} onClick={() => onChange(PRESETS.sports)}>
            {st.presets.sports}
          </button>
          <button type="button" aria-pressed={preset === 'custom'} disabled>
            {st.presets.custom}
          </button>
        </div>
      </div>
      {settingsGroups(t).map((g) => (
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
  const t = useT();
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
          <button type="button" disabled={n <= (meta.min ?? 0)} onClick={() => set(Math.max(meta.min ?? 0, n - (meta.step ?? 1)))} aria-label={t.common.less}>
            −
          </button>
          <output style={{ fontSize: 22, minWidth: 52 }}>
            {n}
            <small style={{ fontSize: 13 }}>{meta.unit}</small>
          </output>
          <button type="button" disabled={n >= (meta.max ?? 999)} onClick={() => set(Math.min(meta.max ?? 999, n + (meta.step ?? 1)))} aria-label={t.common.more}>
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
  const t = useT();
  const st = t.setup;
  const summary = ROLES.filter((r) => comp[r] > 0)
    .map((r) => (comp[r] > 1 || r === 'civilian' || r === 'mafia' ? `${t.roles.inline[r]} × ${comp[r]}` : t.roles.inline[r]))
    .join(', ');
  return (
    <>
      <button type="button" className="choice-card" aria-pressed={dealing === 'app'} onClick={() => onDealing('app')}>
        <RoleIcon role="mafia" width={36} height={36} />
        <div>
          <b>{st.dealApp}</b>
          <span>{st.dealAppText}</span>
        </div>
      </button>
      <button type="button" className="choice-card" aria-pressed={dealing === 'cards'} onClick={() => onDealing('cards')}>
        <RoleIcon role="civilian" width={36} height={36} />
        <div>
          <b>{st.dealCards}</b>
          <span>{st.dealCardsText}</span>
        </div>
      </button>
      <section className="folder">
        <span className="folder__tab">{st.total}</span>
        <p>
          <b>{count}</b> {t.count.playersWord(count)}: {summary}.
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
  const t = useT();
  const st = t.setup;
  const left = (r: Role) => comp[r] - roles.filter((x) => x === r).length;
  const special: Role[] = ROLES.filter((r) => r !== 'civilian' && comp[r] > 0);
  return (
    <>
      <p className="muted">{st.cardsNote}</p>
      <div className="notice notice--host">{st.hostOnly}</div>
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
              aria-label={st.roleAria(seats[i] ?? i + 1)}
            >
              <option value="">—</option>
              {ROLES.map((r) => (
                <option key={r} value={r} disabled={comp[r] === 0 || (left(r) <= 0 && roles[i] !== r)}>
                  {t.roles.name[r]}
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
        {st.restCivilians}
      </button>
      <p className="list__sub">
        {st.left}{' '}
        {ROLES.filter((r) => left(r) !== 0)
          .map((r) => `${t.roles.inline[r]} ${left(r)}`)
          .join(', ') || st.allSet}
      </p>
    </>
  );
}
