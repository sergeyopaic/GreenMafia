// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLASSIC_SETTINGS, dispatch, emptyComposition, getNightStepView, newGame, type Game, type GameEvent, type Role } from '@greenmafia/engine';
import { useApp } from '../../store';
import { dictFor } from '../../i18n/dicts';
import { runtimeFor } from '../../lib/gameRuntime';
import { flushStorage } from '../../lib/persistence';
import { useTabOwnership } from '../../lib/tabOwnership';
import { play, vibrate, setSoundContext } from '../../lib/sound';
import { NightScreen } from './Night';

vi.mock('idb-keyval', () => ({ get: vi.fn(async () => undefined), set: vi.fn(async () => {}), setMany: vi.fn(async () => {}) }));
vi.mock('../../lib/sound', () => ({ setSoundContext: vi.fn(), setSoundEnabled: vi.fn(), setVibrationEnabled: vi.fn(), play: vi.fn(), vibrate: vi.fn() }));

let root: Root;
let container: HTMLDivElement;
const t = dictFor('ru');
type Status = 'live' | 'blocked' | 'dead' | 'absent';
type CheckedRole = 'commissar' | 'don';
const roles: Role[] = ['lover', 'commissar', 'doctor', 'mafia', 'don', 'maniac', 'civilian', 'civilian', 'civilian', 'civilian'];
function apply(game: Game, event: GameEvent): Game {
  const result = dispatch(game, event);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}
function fixture(role: CheckedRole, status: Status): Game {
  const assigned = roles.map((r) => r === role && status === 'absent' ? 'civilian' : r);
  const composition = emptyComposition();
  for (const r of assigned) composition[r]++;
  const result = newGame({ type: 'CreateGame', players: assigned.map((_, i) => ({ id: `p${i}`, name: `Игрок ${i + 1}` })),
    roles: assigned, composition, dealing: 'cards',
    settings: { ...CLASSIC_SETTINGS, firstNight: 'full', openSetup: status !== 'absent', minWakeSeconds: 3 } });
  if (!result.ok) throw new Error(result.error.message);
  let game = result.value;
  const actorId = `p${roles.indexOf(role)}`;
  if (status === 'dead') game = apply(game, { type: 'RemovePlayer', playerId: actorId, cause: 'removed' });
  while (getNightStepView(game.state)?.step !== role) {
    const view = getNightStepView(game.state);
    if (!view) throw new Error('Unexpected end of night');
    if (view.step !== 'meeting' && !view.fake && !view.blocked) {
      game = apply(game, { type: 'NightChoose', target: status === 'blocked' && view.step === 'lover' ? actorId : null });
    }
    game = apply(game, { type: 'Proceed' });
  }
  return game;
}
async function render(game: Game) {
  await act(async () => {
    useApp.setState({ game, gameId: 'night-test', createdAt: 1, screen: { name: 'game' }, ready: true,
      runtime: runtimeFor(game.state), lang: 'ru', handBackAck: true });
    root.render(<NightScreen />);
  });
}
function next(): HTMLButtonElement { return container.querySelector<HTMLButtonElement>('.actions__row > .btn--primary:last-child')!; }
async function tick(ms: number) { await act(async () => { vi.advanceTimersByTime(ms); }); }
async function pick(id: string) {
  const player = useApp.getState().game!.state.players.find((p) => p.id === id)!;
  const chip = [...container.querySelectorAll<HTMLButtonElement>('.chip')].find((b) => b.getAttribute('aria-label')?.startsWith(`${t.num(player.seat)},`));
  if (!chip) throw new Error('No target chip');
  await act(async () => { chip.click(); });
}
async function showAnswer(role: CheckedRole) {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === t.night.showAnswer(role === 'don'));
  if (!button) throw new Error('No answer button');
  await act(async () => { button.click(); });
}

beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useTabOwnership.setState({ status: 'owner' });
  useApp.setState(useApp.getInitialState(), true);
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { await flushStorage(); root.unmount(); });
  container.remove(); vi.useRealTimers(); vi.unstubAllGlobals();
});

describe('секретность реальных ночных экранов', () => {
  it.each((['commissar', 'don'] as const).flatMap((role) => (['live', 'blocked', 'dead', 'absent'] as const).map((status) => ({ role, status }))))(
    '$role / $status: одна минимальная пауза, никаких сигналов действий', async ({ role, status }) => {
      await render(fixture(role, status));
      const view = getNightStepView(useApp.getState().game!.state)!;
      expect(view.fake).toBe(status === 'dead' || status === 'absent');
      expect(view.blocked).toBe(status === 'blocked');
      expect(next().disabled).toBe(true);
      if (status === 'live') await pick(role === 'commissar' ? 'p3' : 'p1');
      else expect(container.textContent).not.toContain(t.night.showAnswer(role === 'don'));
      await tick(2000); expect(next().disabled).toBe(true);
      // A pause must not shorten a fake or blocked wake either.
      await act(async () => { useApp.getState().setPaused(true); });
      await tick(5000); expect(next().disabled).toBe(true);
      await act(async () => { useApp.getState().setPaused(false); });
      await tick(1000); expect(next().disabled).toBe(false);
      expect(play).not.toHaveBeenCalled(); expect(vibrate).not.toHaveBeenCalled();
      expect(setSoundContext).toHaveBeenLastCalledWith('night', false);
    },
  );

  it.each(['commissar', 'don'] as const)('%s: оба ответа имеют одинаковое тёмное оформление, без сигнала и штампа-вспышки', async (role) => {
    await render(fixture(role, 'live'));
    const answers = role === 'commissar'
      ? [['p3', t.stamps['checked-mafia']], ['p6', t.stamps['checked-clean']]]
      : [['p1', t.stamps['checked-commissar']], ['p6', t.stamps['checked-not-commissar']]];
    for (const [id, text] of answers) {
      await pick(id!); await showAnswer(role);
      expect(container.querySelector('.night-answer')!.textContent).toBe(text);
      expect(container.querySelector('.answer-sheet, .slam, .stamp-img')).toBeNull();
      await act(async () => { container.querySelector<HTMLDivElement>('.check-response')!.click(); });
      expect(container.querySelector('.check-response')).toBeNull();
    }
    expect(play).not.toHaveBeenCalled(); expect(vibrate).not.toHaveBeenCalled();
  });

  it('общий сигнал начала ночи не повторяется при выборе цели', async () => {
    // Reuse an actual first-step game; the cue is not tied to a target.
    const game = fixture('commissar', 'live');
    const result = newGame(game.events[0] as Extract<GameEvent, { type: 'CreateGame' }>);
    if (!result.ok) throw new Error('Bad fixture');
    await render(result.value);
    expect(play).toHaveBeenCalledExactlyOnceWith('night-fall', 0.7);
    await pick('p6');
    expect(play).toHaveBeenCalledTimes(1); expect(vibrate).not.toHaveBeenCalled();
  });
});
