// Seat numbers dealt from table cards 1–20 are only labels: the order is the seating order.
import { describe, expect, it } from 'vitest';
import { CLASSIC_SETTINGS, type CreateGameEvent, type Role, emptyComposition, getCurrentSpeaker, newGame, undo } from '../src';
import { act, expectError, night, proceed, skipDay, toDiscussion } from './helpers';

function create(seats: (number | undefined)[], roles: Role[], settings = {}): ReturnType<typeof newGame> {
  const composition = emptyComposition();
  for (const r of roles) composition[r]++;
  const event: CreateGameEvent = {
    type: 'CreateGame',
    settings: { ...CLASSIC_SETTINGS, ...settings },
    players: seats.map((seat, i) => ({ id: `u${i}`, name: '', ...(seat === undefined ? {} : { seat }) })),
    composition,
    dealing: 'cards',
    roles,
  };
  return newGame(event);
}

// Seated clockwise in this order with cards 12, 3, 20, 8, 15. Roles follow the same order.
const ROLES5: Role[] = ['civilian', 'mafia', 'commissar', 'civilian', 'civilian'];
const SEATS5 = [12, 3, 20, 8, 15];

describe('произвольные номера мест', () => {
  it('игроки остаются в порядке посадки, роли и имена — у своих игроков', () => {
    const r = create(SEATS5, ROLES5);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ps = r.value.state.players;
    expect(ps.map((p) => p.seat)).toEqual([12, 3, 20, 8, 15]);
    expect(ps.find((p) => p.seat === 3)?.role).toBe('mafia'); // entered second
    expect(ps.find((p) => p.seat === 20)?.role).toBe('commissar');
    expect(ps.find((p) => p.seat === 12)?.name).toBe('Игрок 12');
  });

  it('речи идут по посадке, а не по номерам: №20 говорит раньше №8', () => {
    const r = create(SEATS5, ROLES5);
    if (!r.ok) throw new Error(r.error.message);
    let g = toDiscussion(proceed(r.value));
    expect(getCurrentSpeaker(g.state)?.seat).toBe(12);
    expect(g.state.days[0]?.order.map((id) => g.state.players.find((p) => p.id === id)?.seat)).toEqual([12, 3, 20, 8, 15]);
    g = night(skipDay(g));
    g = toDiscussion(g);
    expect(g.state.days[1]?.order.map((id) => g.state.players.find((p) => p.id === id)?.seat)).toEqual([3, 20, 8, 15, 12]);
  });

  it('очерёдность перескакивает выбывших и замыкается по кругу', () => {
    const r = create(SEATS5, ROLES5, { firstNight: 'full' });
    if (!r.ok) throw new Error(r.error.message);
    // Mafia (seat 3) kills seat 8.
    const victim = r.value.state.players.find((p) => p.seat === 8)?.id ?? '';
    let g = r.value;
    while (g.state.phase.t === 'night') {
      g = act(g, { type: 'NightChoose', target: g.state.nights[0]?.steps[g.state.phase.stepIndex] === 'mafia' ? victim : null });
      g = proceed(g);
    }
    g = toDiscussion(g);
    expect(g.state.days[0]?.order.map((id) => g.state.players.find((p) => p.id === id)?.seat)).toEqual([12, 3, 20, 15]);
  });

  it('без номеров — 1..N по порядку ввода (как раньше)', () => {
    const r = create([undefined, undefined, undefined, undefined, undefined], ROLES5);
    expect(r.ok && r.value.state.players.map((p) => p.seat)).toEqual([1, 2, 3, 4, 5]);
  });

  it('погибшие объявляются по возрастанию номера, а не по посадке', () => {
    // Seating 12, 3, 20, 8, 15; mafia at №3 kills №8, maniac at №15 kills №12.
    const r = create(SEATS5, ['civilian', 'mafia', 'commissar', 'civilian', 'maniac'], { firstNight: 'full' });
    if (!r.ok) throw new Error(r.error.message);
    const idOf = (seat: number) => r.value.state.players.find((p) => p.seat === seat)?.id ?? null;
    let g = r.value;
    while (g.state.phase.t === 'night') {
      const step = g.state.nights[0]?.steps[g.state.phase.stepIndex];
      g = act(g, { type: 'NightChoose', target: step === 'mafia' ? idOf(8) : step === 'maniac' ? idOf(12) : null });
      g = proceed(g);
    }
    expect(g.state.nights[0]?.deaths.map((d) => g.state.players.find((p) => p.id === d.playerId)?.seat)).toEqual([8, 12]);
  });

  it('ошибки: повтор, вне диапазона, номер указан не у всех', () => {
    const dup = create([3, 3, 5, 6, 7], ROLES5);
    expect(!dup.ok && dup.error.code).toBe('players.seatDup');
    const range = create([0, 2, 3, 4, 21], ROLES5);
    expect(!range.ok && range.error.code).toBe('players.seatRange');
    const partial = create([1, 2, undefined, 4, 5], ROLES5);
    expect(!partial.ok && partial.error.code).toBe('players.seats');
  });
});

describe('пульт ведущего: номер и имя', () => {
  function started() {
    const r = create(SEATS5, ROLES5);
    if (!r.ok) throw new Error(r.error.message);
    return toDiscussion(proceed(r.value));
  }

  it('номер меняется на свободный, порядок речей не меняется', () => {
    let g = started();
    const order = g.state.days[0]?.order;
    g = act(g, { type: 'ChangeSeat', playerId: 'u0', seat: 7 });
    expect(g.state.players.find((p) => p.id === 'u0')?.seat).toBe(7);
    expect(g.state.days[0]?.order).toEqual(order);
    expect(g.state.players.map((p) => p.id)).toEqual(['u0', 'u1', 'u2', 'u3', 'u4']);
  });

  it('занятый номер и номер вне 1–20 — ошибка', () => {
    const g = started();
    expect(expectError(g, { type: 'ChangeSeat', playerId: 'u0', seat: 3 }, 'seat.taken')).toContain('Номер 3');
    expectError(g, { type: 'ChangeSeat', playerId: 'u0', seat: 21 }, 'seat.range');
  });

  it('номер можно поменять и выбывшему', () => {
    let g = started();
    g = act(g, { type: 'RemovePlayer', playerId: 'u3', cause: 'left' });
    g = act(g, { type: 'ChangeSeat', playerId: 'u3', seat: 1 });
    expect(g.state.players.find((p) => p.id === 'u3')?.seat).toBe(1);
  });

  it('имя исправляется; пустое — «Игрок N»; смена отменяется', () => {
    let g = started();
    g = act(g, { type: 'RenamePlayer', playerId: 'u1', name: '  Мика  ' });
    expect(g.state.players.find((p) => p.id === 'u1')?.name).toBe('Мика');
    g = act(g, { type: 'RenamePlayer', playerId: 'u1', name: '' });
    expect(g.state.players.find((p) => p.id === 'u1')?.name).toBe('Игрок 3');
    expectError(g, { type: 'RenamePlayer', playerId: 'u1', name: 'x'.repeat(21) }, 'name.long');
    expectError(g, { type: 'RenamePlayer', playerId: 'u0', name: 'игрок 3' }, 'name.taken');
    expect(undo(g).state.players.find((p) => p.id === 'u1')?.name).toBe('Мика');
  });
});
