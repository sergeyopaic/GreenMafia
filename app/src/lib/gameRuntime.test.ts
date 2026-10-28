import { describe, expect, it } from 'vitest';
import { CLASSIC_SETTINGS, emptyComposition, newGame, type GameState, type Phase, type Role } from '@greenmafia/engine';
import { pauseRuntime, phaseKey, runtimeFor, timerRemaining } from './gameRuntime';

function state(phase: Phase): GameState {
  const roles: Role[] = ['mafia', 'commissar', 'civilian', 'civilian', 'civilian'];
  const composition = emptyComposition();
  for (const r of roles) composition[r]++;
  const result = newGame({ type: 'CreateGame', settings: CLASSIC_SETTINGS, dealing: 'cards', roles, composition, players: roles.map((_, i) => ({ id: `p${i}`, name: `P${i}` })) });
  if (!result.ok) throw new Error(result.error.message);
  const s = result.value.state;
  s.phase = phase;
  s.days = [{ number: 1, order: s.players.map((p) => p.id), firstSpeaker: 'p0', nominations: [], rounds: [], eliminated: [], verdict: null, voteCancelled: false }];
  return s;
}

describe('восстановление текущего действия', () => {
  it('сохраняет голоса, числа, режим и страницу; не меняет журнал правил', () => {
    const s = state({ t: 'voting', number: 1, kind: 'main', candidates: ['p0', 'p1'] });
    const before = structuredClone(s);
    const runtime = runtimeFor(s);
    runtime.voting = { votes: { p0: ['p2', 'p3'], p1: ['p4'] }, counts: { p0: 2, p1: 1 }, quick: true, page: 2, yes: [], count: 0 };
    const restored = runtimeFor(s, JSON.parse(JSON.stringify(runtime)), true);
    expect(restored.voting).toEqual(runtime.voting);
    expect(restored.paused).toBe(true);
    expect(s).toEqual(before);
  });

  it('восстанавливает подъём всех и переголосование', () => {
    for (const kind of ['allOut', 'revote'] as const) {
      const s = state({ t: 'voting', number: 1, kind, candidates: ['p0', 'p1'] });
      const runtime = runtimeFor(s);
      runtime.voting!.yes = ['p2', 'p3'];
      runtime.voting!.count = 3;
      runtime.voting!.quick = true;
      expect(runtimeFor(s, runtime, true).voting).toEqual(runtime.voting);
    }
  });

  it('отбрасывает чужих, выбывших и повторно отмеченных голосующих', () => {
    const s = state({ t: 'voting', number: 1, kind: 'main', candidates: ['p0', 'p1'] });
    s.players[4]!.alive = false;
    const runtime = runtimeFor(s);
    runtime.voting!.votes = { p0: ['p2', 'p2', 'ghost', 'p4'], p1: ['p2', 'p3'] };
    runtime.voting!.counts = { p0: 3, p1: 99 };
    const restored = runtimeFor(s, runtime);
    expect(restored.voting!.votes).toEqual({ p0: ['p2'], p1: ['p3'] });
    expect(restored.voting!.counts).toEqual({ p0: 3, p1: 1 });
  });

  it('не переносит черновик в другую фазу/раунд и игнорирует неизвестный формат', () => {
    const s = state({ t: 'voting', number: 1, kind: 'main', candidates: ['p0'] });
    const runtime = runtimeFor(s);
    runtime.voting!.counts.p0 = 3;
    s.phase = { t: 'voting', number: 1, kind: 'revote', candidates: ['p0'] };
    expect(runtimeFor(s, runtime).voting!.counts.p0).toBe(0);
    expect(runtimeFor(s, { ...runtimeFor(s), version: 99 }).voting!.counts.p0).toBe(0);
    s.phase = { t: 'night', number: 2, stepIndex: 0 };
    expect(runtimeFor(s, runtime).voting).toBeNull();
  });

  it('для речи, защиты и последнего слова сохраняет остаток на паузе', () => {
    for (const phase of [
      { t: 'discussion', number: 1, index: 0 },
      { t: 'defense', number: 1, candidates: ['p0', 'p1'], queue: ['p0', 'p1'] },
      { t: 'lastWords', number: 1, queue: ['p0'], then: 'discussion' },
    ] as Phase[]) {
      const s = state(phase);
      const runtime = runtimeFor(s);
      runtime.timer = { ...runtime.timer!, remainingMs: 15_000, running: true, deadline: 16_000 };
      const paused = pauseRuntime(runtime, true, 6000);
      expect(paused.timer!.remainingMs).toBe(10_000);
      expect(timerRemaining(paused.timer!, 100_000)).toBe(10_000);
      const restored = runtimeFor(s, JSON.parse(JSON.stringify(paused)), true, 100_000);
      expect(restored.paused).toBe(true);
      expect(restored.timer!.remainingMs).toBe(10_000);
      expect(pauseRuntime(restored, false, 100_000).timer!.deadline).toBe(110_000);
    }
  });

  it('при внезапном завершении процесса использует сохранённый deadline, не полный интервал', () => {
    const s = state({ t: 'discussion', number: 1, index: 0 });
    const runtime = runtimeFor(s);
    runtime.timer = { ...runtime.timer!, running: true, deadline: 60_000 };
    const restored = runtimeFor(s, runtime, true, 45_000);
    expect(restored.timer!.remainingMs).toBe(15_000);
    expect(restored.timer!.deadline).toBeNull();
    expect(restored.paused).toBe(true);
    expect(runtimeFor(s, runtime, true, 90_000).timer!.remainingMs).toBe(0);
  });

  it('смена имени/номинация не сбрасывает таймер, новый говорящий получает свой', () => {
    const s = state({ t: 'discussion', number: 1, index: 0 });
    const runtime = runtimeFor(s);
    runtime.timer!.remainingMs = 12_000;
    s.players[0]!.name = 'New name';
    s.days[0]!.nominations.push({ by: 'p0', candidate: 'p1' });
    expect(runtimeFor(s, runtime).timer!.remainingMs).toBe(12_000);
    const oldKey = phaseKey(s);
    s.phase = { t: 'discussion', number: 1, index: 1 };
    expect(phaseKey(s)).not.toBe(oldKey);
    expect(runtimeFor(s, runtime).timer!.remainingMs).toBe(60_000);
  });
});
