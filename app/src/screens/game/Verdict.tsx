import type { Player } from '@greenmafia/engine';
import { Chip } from '../../components/Chip';
import { IdentityLine } from '../../components/Identity';
import { Stamp } from '../../components/Stamp';
import { TypeLine } from '../../components/TypeLine';
import { verdictText } from '../../lib/text';
import { useApp, useGame } from '../../store';

export function VerdictScreen() {
  const state = useGame();
  const dispatch = useApp((s) => s.dispatch);
  if (state.phase.t !== 'verdict') return null;
  const { eliminated, reason } = state.phase;
  const out = eliminated.map((id) => state.players.find((p) => p.id === id)).filter((p): p is Player => !!p);
  const text = verdictText(reason, out);
  const next = state.pendingResult
    ? 'К финалу'
    : state.settings.lastWordDay && out.length > 0
      ? 'Последнее слово'
      : 'Наступает ночь';

  return (
    <main className="screen">
      <div className="eyebrow center">итог дня {state.phase.number}</div>
      {out.length > 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 28, flexWrap: 'wrap', padding: '18px 0' }}>
          {out.map((p, i) => (
            <div key={p.id} className="hero-chip" style={{ position: 'relative', display: 'grid', placeItems: 'center', gap: 4 }}>
              <div style={{ transform: 'scale(1.3)' }}>
                <Chip player={p} look={{ inert: true }} />
              </div>
              <div style={{ position: 'absolute', top: 18 }}>
                <Stamp kind="exiled" rotate={i % 2 ? 8 : -9} />
              </div>
              <div className="list__sub" style={{ marginTop: 10 }}>
                <IdentityLine state={state} playerId={p.id} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="closed">
          <div className="closed__title">Никто не покидает город</div>
        </div>
      )}
      <TypeLine text={text} />
      {state.pendingResult && <div className="notice">Игра окончена — по итогам дня определён победитель.</div>}
      <div className="actions">
        <button type="button" className="btn btn--primary btn--block" onClick={() => dispatch({ type: 'Proceed' })}>
          {next}
        </button>
      </div>
    </main>
  );
}
