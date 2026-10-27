import { type Player, getEligibleVoters } from '@greenmafia/engine';
import { useMemo, useState } from 'react';
import { ChipGrid, MiniChip } from '../../components/Chip';
import { TypeLine } from '../../components/TypeLine';
import { play } from '../../lib/sound';
import { useT } from '../../i18n';
import { useApp, useGame } from '../../store';

export function VotingScreen() {
  const state = useGame();
  if (state.phase.t !== 'voting') return null;
  const day = state.days[state.days.length - 1];
  const key = `${state.phase.number}-${day?.rounds.length ?? 0}-${state.phase.kind}-${state.phase.candidates.join()}`;
  return state.phase.kind === 'allOut' ? <AllOutRound key={key} /> : <CandidateRound key={key} />;
}

function useVotingBasics() {
  const state = useGame();
  const ph = state.phase.t === 'voting' ? state.phase : null;
  const eligible = getEligibleVoters(state);
  const eligibleIds = new Set(eligible.map((p) => p.id));
  const byId = (id: string) => state.players.find((p) => p.id === id) as Player;
  return { state, ph, eligible, eligibleIds, byId };
}

// ---------- Main round and revote ----------

function CandidateRound() {
  const { state, ph, eligible, eligibleIds, byId } = useVotingBasics();
  const t = useT();
  const v = t.voting;
  const dispatch = useApp((s) => s.dispatch);
  const candidates = (ph?.candidates ?? []).map(byId);
  const [votes, setVotes] = useState<Record<string, string[]>>(() => Object.fromEntries(candidates.map((c) => [c.id, []])));
  const [page, setPage] = useState(0);
  const [quick, setQuick] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>(() => Object.fromEntries(candidates.map((c) => [c.id, 0])));
  const [lastTap, setLastTap] = useState<string | null>(null);

  const owner = useMemo(() => {
    const m = new Map<string, string>();
    for (const [cand, voters] of Object.entries(votes)) for (const v of voters) m.set(v, cand);
    return m;
  }, [votes]);

  if (!ph) return null;
  const summary = page >= candidates.length;
  const current = candidates[page];
  const abstain = state.settings.abstainAllowed;

  const countOf = (id: string) => (quick ? (counts[id] ?? 0) : (votes[id]?.length ?? 0));
  const cast = candidates.reduce((s, c) => s + countOf(c.id), 0);
  const silent = Math.max(0, eligible.length - cast);
  const finalCount = (id: string, i: number) => countOf(id) + (!abstain && i === candidates.length - 1 ? silent : 0);

  function toggle(p: Player) {
    if (!current || !eligibleIds.has(p.id)) return;
    const holder = owner.get(p.id);
    if (holder && holder !== current.id) {
      useApp.getState().showToast(v.alreadyVotes(p.seat, byId(holder).seat));
      return;
    }
    setVotes((v) => {
      const list = v[current.id] ?? [];
      const next = list.includes(p.id) ? list.filter((x) => x !== p.id) : [...list, p.id];
      return { ...v, [current.id]: next };
    });
    if (!votes[current.id]?.includes(p.id)) {
      setLastTap(p.id);
      play('chip', 0.5);
    }
  }

  function submit() {
    if (quick) dispatch({ type: 'CastVotes', counts });
    else dispatch({ type: 'CastVotes', voters: votes });
  }

  const intro =
    ph.kind === 'main'
      ? page === 0
        ? `${t.script.voteStart(candidates)} `
        : ''
      : page === 0
        ? t.script.revoteIntro(candidates)
        : '';

  // Outcome preview for the host.
  const finals = candidates.map((c, i) => ({ c, n: finalCount(c.id, i) }));
  const max = Math.max(0, ...finals.map((f) => f.n));
  const leaders = finals.filter((f) => f.n === max && max > 0).map((f) => f.c);

  return (
    <main className="screen">
      <div className="cand-tabs" role="tablist">
        {candidates.map((c, i) => (
          <button type="button" key={c.id} aria-pressed={page === i} onClick={() => setPage(i)}>
            <MiniChip player={c} /> {countOf(c.id)}
          </button>
        ))}
        <button type="button" aria-pressed={summary} onClick={() => setPage(candidates.length)}>
          {v.summaryTab}
        </button>
      </div>

      {!summary && current && (
        <>
          <TypeLine text={intro + t.script.voteCandidate(current)} />
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div>
              <div className="eyebrow">{v.candidateOf(page + 1, candidates.length)}</div>
              <h2>
                {t.num(current.seat)} · {current.name}
              </h2>
            </div>
            <div className="tally__count" style={{ fontSize: 44 }}>
              {countOf(current.id)}
            </div>
          </div>

          {quick ? (
            <QuickCount
              value={counts[current.id] ?? 0}
              max={eligible.length - cast + (counts[current.id] ?? 0)}
              onChange={(n) => setCounts((c) => ({ ...c, [current.id]: n }))}
            />
          ) : (
            <ChipGrid
              players={state.players}
              look={(p) => {
                const holder = owner.get(p.id);
                const mine = holder === current.id;
                const elsewhere = holder && !mine;
                return {
                  selected: mine,
                  voted: mine && lastTap === p.id,
                  disabled: !eligibleIds.has(p.id) || !!elsewhere,
                  inert: !eligibleIds.has(p.id),
                  candidate: p.id === current.id,
                  tag: elsewhere ? `→${t.num(byId(holder).seat)}` : mine ? v.tagCounted : p.id === current.id ? v.tagCandidate : !p.alive ? '' : !eligibleIds.has(p.id) ? v.tagAlibi : '',
                };
              }}
              onPick={toggle}
            />
          )}
        </>
      )}

      {summary && (
        <>
          <h2>{v.summaryTitle(ph.kind === 'main')}</h2>
          <div className="tally">
            {finals.map(({ c, n }, i) => {
              const forced = !abstain && i === candidates.length - 1 ? silent : 0;
              return (
                <div className="tally__row" key={c.id}>
                  <MiniChip player={c} />
                  <div className="tally__bar" aria-hidden="true">
                    {Array.from({ length: n }, (_, k) => (
                      <i key={k} className={k >= n - forced ? 'is-forced' : ''} />
                    ))}
                  </div>
                  <div className="tally__count">{n}</div>
                </div>
              );
            })}
          </div>
          <p className="list__sub">
            {v.voters(eligible.length)}
            {abstain ? v.abstained(silent) : silent > 0 ? v.forced(silent) : ''}
          </p>
          <div className="notice notice--host">
            {leaders.length === 0 ? v.noVotes : leaders.length === 1 ? v.out(leaders[0]!.seat) : v.tie(leaders)}
          </div>
        </>
      )}

      <div className="actions">
        <button type="button" className="btn btn--ghost" style={{ alignSelf: 'center', minHeight: 32 }} onClick={() => setQuick((q) => !q)}>
          {quick ? v.byChips : v.byNumber}
        </button>
        <div className="actions__row">
          {page > 0 && (
            <button type="button" className="btn btn--secondary" onClick={() => setPage((p) => p - 1)}>
              {t.common.back}
            </button>
          )}
          {summary ? (
            <button type="button" className="btn btn--primary" onClick={submit}>
              {v.count}
            </button>
          ) : (
            <button type="button" className="btn btn--primary" onClick={() => setPage((p) => p + 1)}>
              {v.next(page === candidates.length - 1)}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

function QuickCount({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  const t = useT();
  return (
    <div className="folder" style={{ display: 'flex', justifyContent: 'center' }}>
      <div className="stepper">
        <button type="button" disabled={value <= 0} onClick={() => onChange(value - 1)} aria-label={t.common.less}>
          −
        </button>
        <output style={{ fontSize: 48, minWidth: 80 }}>{value}</output>
        <button type="button" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={t.common.more}>
          +
        </button>
      </div>
    </div>
  );
}

// ---------- All out ----------

function AllOutRound() {
  const { state, ph, eligible, eligibleIds, byId } = useVotingBasics();
  const t = useT();
  const v = t.voting;
  const dispatch = useApp((s) => s.dispatch);
  const [yes, setYes] = useState<string[]>([]);
  const [quick, setQuick] = useState(false);
  const [count, setCount] = useState(0);
  if (!ph) return null;
  const tied = ph.candidates.map(byId);
  const n = quick ? count : yes.length;
  const need = Math.floor(eligible.length / 2) + 1;

  return (
    <main className="screen">
      <TypeLine text={t.script.voteAllOut(tied)} />
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <div className="eyebrow">{v.allOut}</div>
          <h2>{v.forCount(n)}</h2>
        </div>
        <div className="list__sub" style={{ textAlign: 'right' }}>
          {v.need(need, eligible.length)}
          <br />
          {v.allOutResult(n >= need, tied)}
        </div>
      </div>
      {quick ? (
        <QuickCount value={count} max={eligible.length} onChange={setCount} />
      ) : (
        <ChipGrid
          players={state.players}
          look={(p) => ({
            selected: yes.includes(p.id),
            disabled: !eligibleIds.has(p.id),
            inert: !eligibleIds.has(p.id),
            candidate: ph.candidates.includes(p.id),
            tag: yes.includes(p.id) ? v.tagFor : !p.alive ? '' : !eligibleIds.has(p.id) ? v.tagNoVote : '',
          })}
          onPick={(p) => {
            if (!eligibleIds.has(p.id)) return;
            setYes((y) => (y.includes(p.id) ? y.filter((x) => x !== p.id) : [...y, p.id]));
          }}
        />
      )}
      <div className="actions">
        <button type="button" className="btn btn--ghost" style={{ alignSelf: 'center', minHeight: 32 }} onClick={() => setQuick((q) => !q)}>
          {quick ? v.byChipsShort : v.byNumber}
        </button>
        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={() => dispatch(quick ? { type: 'CastVotes', counts: { yes: count } } : { type: 'CastVotes', voters: { yes } })}
        >
          {v.count}
        </button>
      </div>
    </main>
  );
}
