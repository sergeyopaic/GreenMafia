import { type ActionStep, type GameState, type NightRecord, isMafiaTeam } from '@greenmafia/engine';
import { DEATH_CAUSE, STEP_NAME, seat, verdictText } from '../lib/text';

/** §9.5 — night by night, day by day. */
export function Chronicle({ state }: { state: GameState }) {
  const byId = (id: string | null | undefined) => state.players.find((p) => p.id === id);
  const label = (id: string | null | undefined) => {
    const p = byId(id);
    return p ? `${seat(p)} ${p.name}` : '—';
  };

  const removals = (phase: 'night' | 'day', n: number) =>
    state.players.filter((p) => p.death && (p.death.cause === 'removed' || p.death.cause === 'left') && p.death.phase === phase && p.death.number === n);

  function nightLines(night: NightRecord): [string, string][] {
    if (night.kind === 'meeting') return [['Знакомство', 'мафия увидела друг друга']];
    const rows: [string, string][] = [];
    for (const step of night.steps) {
      if (step === 'meeting') continue;
      const c = night.choices[step as ActionStep];
      const client = byId(night.blocked);
      const clientActsHere =
        step !== 'lover' && !!client && (step === 'mafia' ? isMafiaTeam(client.role) : client.role === step);
      let text: string;
      if (c === undefined) text = clientActsHere ? 'у любовницы — хода нет' : 'роль выбыла';
      else if (c === null) text = step === 'mafia' ? 'промах' : 'пропуск';
      else text = label(c);
      if (step === 'mafia' && c !== undefined && clientActsHere) text += ` · ${seat(client!)} у любовницы`;
      if (step === 'doctor' && c && night.saved.includes(c)) text += ' · спас';
      if (step === 'commissar' && night.checkResult) {
        text += ` · ${night.checkResult === 'mafia' ? 'мафия' : night.checkResult === 'notMafia' ? 'не мафия' : 'нет ответа'}`;
      }
      if (step === 'don' && night.donResult) {
        text += ` · ${night.donResult === 'commissar' ? 'комиссар' : night.donResult === 'notCommissar' ? 'не комиссар' : 'нет ответа'}`;
      }
      rows.push([STEP_NAME[step], text]);
    }
    rows.push([
      'Итог',
      night.deaths.length === 0
        ? 'никто не погиб'
        : night.deaths.map((d) => `${label(d.playerId)}${d.cause === 'loverLink' ? ' (вместе с любовницей)' : ''}`).join(', '),
    ]);
    if (night.alibiFor) rows.push(['Алиби', label(night.alibiFor)]);
    for (const p of removals('night', night.number)) rows.push(['Выбыл', `${label(p.id)} — ${DEATH_CAUSE[p.death!.cause]}`]);
    return rows;
  }

  const blocks: { title: string; rows: [string, string][] }[] = [];
  const maxN = Math.max(state.nights.length, state.days.length);
  for (let i = 0; i < maxN; i++) {
    const night = state.nights[i];
    if (night) blocks.push({ title: `Ночь ${night.number}`, rows: nightLines(night) });
    const day = state.days[i];
    if (day) {
      const rows: [string, string][] = [];
      rows.push(['Начинал', label(day.firstSpeaker)]);
      rows.push([
        'Выставлены',
        day.nominations.length ? day.nominations.map((n) => `${label(n.candidate)} (от ${seat(byId(n.by)!)})`).join(', ') : 'никто',
      ]);
      for (const r of day.rounds) {
        const name = r.kind === 'main' ? 'Голосование' : r.kind === 'revote' ? 'Переголосование' : 'Подъём всех';
        const text =
          r.kind === 'allOut'
            ? `за ${r.counts.yes ?? 0} из ${r.eligible}`
            : r.candidates
                .map((c) => {
                  const voters = r.voters?.[c];
                  return `${seat(byId(c)!)} — ${r.counts[c] ?? 0}${voters && voters.length ? ` (${voters.map((v) => seat(byId(v)!)).join(' ')})` : ''}`;
                })
                .join('; ') + (r.forced ? ` · ${r.forced} молчащих голосов последнему` : '');
        rows.push([name, text]);
      }
      if (day.verdict) {
        const out = day.eliminated.map((id) => byId(id)!).filter(Boolean);
        rows.push(['Итог', verdictText(day.verdict, out)]);
      }
      for (const p of removals('day', day.number)) rows.push(['Выбыл', `${label(p.id)} — ${DEATH_CAUSE[p.death!.cause]}`]);
      blocks.push({ title: `День ${day.number}`, rows });
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
