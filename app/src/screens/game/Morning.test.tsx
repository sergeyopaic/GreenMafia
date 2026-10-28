// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLASSIC_SETTINGS, dispatch, emptyComposition, getCurrentSpeaker, getNightStepView, newGame, type Game, type GameEvent, type Role } from '@greenmafia/engine';
import { useApp } from '../../store';
import { dictFor } from '../../i18n/dicts';
import { runtimeFor } from '../../lib/gameRuntime';
import { flushStorage } from '../../lib/persistence';
import { useTabOwnership } from '../../lib/tabOwnership';
import { MorningScreen } from './Morning';

vi.mock('idb-keyval', () => ({ get: vi.fn(async () => undefined), set: vi.fn(async () => {}), setMany: vi.fn(async () => {}) }));
vi.mock('../../lib/sound', () => ({ setSoundContext: vi.fn(), setSoundEnabled: vi.fn(), setVibrationEnabled: vi.fn(), play: vi.fn(), vibrate: vi.fn() }));

let root: Root;
let container: HTMLDivElement;
const t = dictFor('ru');
const m = t.morning;
// Seated clockwise with table cards 12, 3, 20, 8, 15: the numbers are only labels.
const SEATS = [12, 3, 20, 8, 15];
const ROLES: Role[] = ['civilian', 'mafia', 'commissar', 'civilian', 'civilian'];

function apply(game: Game, event: GameEvent): Game {
  const result = dispatch(game, event);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}
/** Classic game after the mafia meeting: the morning of day 1. */
function morning1(): Game {
  const composition = emptyComposition();
  for (const r of ROLES) composition[r]++;
  const result = newGame({ type: 'CreateGame', players: SEATS.map((seat, i) => ({ id: `u${i}`, name: `Игрок ${seat}`, seat })),
    roles: ROLES, composition, dealing: 'cards', settings: CLASSIC_SETTINGS });
  if (!result.ok) throw new Error(result.error.message);
  return apply(result.value, { type: 'Proceed' });
}
async function render(game: Game) {
  await act(async () => {
    useApp.setState({ game, gameId: 'morning-test', createdAt: 1, screen: { name: 'game' }, ready: true,
      runtime: runtimeFor(game.state), lang: 'ru', handBackAck: true });
    root.render(<MorningScreen />);
  });
}
function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
async function pickSeat(seat: number) {
  const chip = [...document.querySelectorAll<HTMLButtonElement>('.sheet .chip')].find((b) => b.getAttribute('aria-label')?.startsWith(`${t.num(seat)},`));
  if (!chip) throw new Error(`No chip ${seat}`);
  await act(async () => { chip.click(); });
}
const block = () => container.querySelector('.opener');

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useTabOwnership.setState({ status: 'owner' });
  useApp.setState(useApp.getInitialState(), true);
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { await flushStorage(); root.unmount(); });
  container.remove(); vi.unstubAllGlobals();
});

describe('утро первого дня', () => {
  it('ведущий выбирает, кто начинает; дальше — по посадке, а не по номерам', async () => {
    await render(morning1());
    expect(block()!.textContent).toContain(t.who({ seat: 12, name: 'Игрок 12' }));
    expect(block()!.textContent).toContain(m.openerDefault);
    expect(block()!.textContent).toContain(m.openerOrder('№3, №20, №8, №15'));

    await act(async () => { button(m.openerChange).click(); });
    expect(document.body.textContent).toContain(m.openerTitle);
    await pickSeat(20);
    expect(document.body.textContent).not.toContain(m.openerTitle); // the picker closes
    expect(useApp.getState().game!.state.dayOneOpener).toBe('u2');
    expect(block()!.textContent).toContain(t.who({ seat: 20, name: 'Игрок 20' }));
    expect(block()!.textContent).toContain(m.openerChosen);
    expect(block()!.textContent).toContain(m.openerOrder('№8, №15, №12, №3'));

    // The discussion then opens with the chosen player.
    const discussion = apply(useApp.getState().game!, { type: 'Proceed' });
    expect(getCurrentSpeaker(discussion.state)?.seat).toBe(20);
  });

  it('одна заметка в газете не разрезается на две колонки', async () => {
    await render(morning1());
    const body = container.querySelector('.paper__body')!;
    expect(body.classList.contains('paper__body--single')).toBe(true);
    expect(body.textContent).toBe(m.meetingBody);
  });

  it('со второго дня выбора нет: очередь идёт по кругу сама', async () => {
    let game = apply(morning1(), { type: 'Proceed' });
    while (game.state.phase.t !== 'night') game = apply(game, { type: 'Proceed' });
    while (game.state.phase.t === 'night') {
      const view = getNightStepView(game.state)!;
      if (view.step !== 'meeting' && !view.fake && !view.blocked) game = apply(game, { type: 'NightChoose', target: null });
      game = apply(game, { type: 'Proceed' });
    }
    expect(game.state.phase).toMatchObject({ t: 'morning', number: 2 });
    await render(game);
    expect(block()).toBeNull();
  });
});
