import { type ActionStep, type GameState, type NightRecord, isMafiaTeam } from '@greenmafia/engine';
import { useT } from '../i18n';

/** §9.5 — night by night, day by day. */
export function Chronicle({ state }: { state: GameState }) {
  const t = useT();
  const c = t.chronicle;
  const byId = (id: string | null | undefined) => state.players.find((p) => p.id === id);
  const seatOf = (id: string | null | undefined) => {
    const p = byId(id);
    return p ? t.num(p.seat) : '?';
  };
  const label = (id: string | null | undefined) => {
    const p = byId(id);
    return p ? `${t.num(p.seat)} ${p.name}` : '—';
  };

  const removals = (phase: 'night' | 'day', n: number) =>
    state.players.filter((p) => p.death && (p.death.cause === 'removed' || p.death.cause === 'left') && p.death.phase === phase && p.death.number === n);

  function nightLines(night: NightRecord): [string, string][] {
    if (night.kind === 'meeting') return [[c.meeting, c.meetingText]];
    const rows: [string, string][] = [];
    for (const step of night.steps) {
      if (step === 'meeting') continue;
      const choice = night.choices[step as ActionStep];
      const client = byId(night.blocked);
      const clientActsHere =
        step !== 'lover' && !!client && (step === 'mafia' ? isMafiaTeam(client.role) : client.role === step);
      let text: string;
      if (choice === undefined) text = clientActsHere ? c.blocked : c.roleOut;
      else if (choice === null) text = step === 'mafia' ? c.miss : c.skip;
      else text = label(choice);
      if (step === 'mafia' && choice !== undefined && clientActsHere && client) text += c.clientBlocked(client.seat);
      if (step === 'doctor' && choice && night.saved.includes(choice)) text += c.saved;
      if (step === 'commissar' && night.checkResult) text += ` · ${c.check[night.checkResult]}`;
      if (step === 'don' && night.donResult) text += ` · ${c.donCheck[night.donResult]}`;
      rows.push([t.steps[step], text]);
    }
    rows.push([
      c.result,
      night.deaths.length === 0
        ? c.nobodyDied
        : night.deaths.map((d) => `${label(d.playerId)}${d.cause === 'loverLink' ? c.withLover : ''}`).join(', '),
    ]);
    if (night.alibiFor) rows.push([c.alibi, label(night.alibiFor)]);
    for (const p of removals('night', night.number)) rows.push([c.out, `${label(p.id)} — ${t.death[p.death!.cause]}`]);
    return rows;
  }

  const blocks: { title: string; rows: [string, string][] }[] = [];
  const maxN = Math.max(state.nights.length, state.days.length);
  for (let i = 0; i < maxN; i++) {
    const night = state.nights[i];
    if (night) blocks.push({ title: c.night(night.number), rows: nightLines(night) });
    const day = state.days[i];
    if (day) {
      const rows: [string, string][] = [];
      rows.push([c.opened, label(day.firstSpeaker)]);
      rows.push([
        c.nominated,
        day.nominations.length
          ? day.nominations.map((n) => `${label(n.candidate)} ${c.by(byId(n.by)?.seat ?? 0)}`).join(', ')
          : c.nobody,
      ]);
      for (const r of day.rounds) {
        const text =
          r.kind === 'allOut'
            ? c.allOutCount(r.counts.yes ?? 0, r.eligible)
            : r.candidates
                .map((cand) => {
                  const voters = r.voters?.[cand];
                  return `${seatOf(cand)} — ${r.counts[cand] ?? 0}${voters && voters.length ? ` (${voters.map(seatOf).join(' ')})` : ''}`;
                })
                .join('; ') + (r.forced ? c.forcedNote(r.forced) : '');
        rows.push([c.round[r.kind] ?? r.kind, text]);
      }
      if (day.verdict) {
        const out = day.eliminated.map((id) => byId(id)).filter((p): p is NonNullable<typeof p> => !!p);
        rows.push([c.result, t.verdict(day.verdict, out)]);
      }
      for (const p of removals('day', day.number)) rows.push([c.out, `${label(p.id)} — ${t.death[p.death!.cause]}`]);
      blocks.push({ title: c.day(day.number), rows });
    }
  }

  return (
    <div className="chronicle">
      {blocks.map((b) => (
        <section key={b.title}>
          <h3>{b.title}</h3>
          <dl style={{ margin: 0 }}>
            {b.rows.map(([k, v], i) => (
              <div className="chronicle__line" key={i}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
