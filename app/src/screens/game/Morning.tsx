import { getMorningReport } from '@greenmafia/engine';
import { Chip } from '../../components/Chip';
import { IdentityLine } from '../../components/Identity';
import { Stamp } from '../../components/Stamp';
import { TypeLine } from '../../components/TypeLine';
import { SCRIPT, seat } from '../../lib/text';
import { useApp, useGame } from '../../store';

/** §7.5, §14.5 — the morning paper. */
export function MorningScreen() {
  const state = useGame();
  const dispatch = useApp((s) => s.dispatch);
  const report = getMorningReport(state);
  if (!report) return null;
  const deaths = report.deaths.map((d) => d.player);

  let headline: string;
  if (report.meeting) headline = 'Город просыпается';
  else if (deaths.length === 0) headline = 'Ночь прошла спокойно';
  else if (deaths.length === 1) headline = `Этой ночью погиб ${seat(deaths[0]!)}`;
  else headline = `Этой ночью погибли ${deaths.map(seat).join(' и ')}`;

  const lines = [SCRIPT.morningStart];
  if (!report.meeting) {
    if (deaths.length === 0) lines.push(SCRIPT.deathsNone);
    else if (deaths.length === 1) lines.push(SCRIPT.deathsOne(deaths[0]!));
    else lines.push(SCRIPT.deathsMany(deaths));
    if (report.someoneSaved) lines.push(SCRIPT.saved);
    if (report.alibi) lines.push(SCRIPT.alibi(report.alibi));
  }

  const lastWords = state.settings.lastWordNight && deaths.length > 0;
  const next = state.pendingResult ? 'К финалу' : lastWords ? 'Последнее слово' : 'К обсуждению';

  return (
    <main className="screen">
      <article className="paper">
        <div className="paper__mast">Вечерний город</div>
        <div className="paper__meta">
          <span>утренний выпуск</span>
          <span>день {report.number}</span>
        </div>
        <h2 className="paper__headline">{headline}</h2>

        {deaths.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 28, flexWrap: 'wrap', padding: '6px 0' }}>
            {report.deaths.map(({ player }, i) => (
              <div key={player.id} className="hero-chip" style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
                <Chip player={player} look={{ inert: true }} />
                <div style={{ position: 'absolute', top: 14 }}>
                  <Stamp kind="killed" rotate={i % 2 ? 9 : -10} />
                </div>
                <div className="list__sub center" style={{ marginTop: 4 }}>
                  <IdentityLine state={state} playerId={player.id} />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="paper__body">
          {report.meeting ? (
            <p>Первая ночь прошла без происшествий: мафия познакомилась и затаилась. Город начинает обсуждение.</p>
          ) : deaths.length === 0 ? (
            <p>Жители проснулись в полном составе. Кто-то в городе не сомкнул глаз — но жертв нет.</p>
          ) : (
            <p>
              Следствие не называет виновных.
              {state.settings.lastWordNight && ` ${deaths.length === 1 ? 'Погибшему' : 'Погибшим'} дадут сказать последнее слово.`}
            </p>
          )}
          {report.alibi && (
            <p>
              <b>Алиби.</b> У игрока {seat(report.alibi)} есть железное алиби: сегодня его нельзя выставить на голосование.
            </p>
          )}
          {report.someoneSaved && <p>По слухам, этой ночью кого-то спасли.</p>}
        </div>
      </article>

      <TypeLine text={lines.join(' ')} />

      {state.pendingResult && <div className="notice">Игра окончена — по итогам ночи определён победитель.</div>}

      <div className="actions">
        <button type="button" className="btn btn--primary btn--block" onClick={() => dispatch({ type: 'Proceed' })}>
          {next}
        </button>
      </div>
    </main>
  );
}
