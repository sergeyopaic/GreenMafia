import { CLASSIC_SETTINGS, type GameEvent, type Role, emptyComposition, newGame, dispatch } from '@greenmafia/engine';
import { describe, expect, it } from 'vitest';
import { finishedGames, playerStats } from './playerStats';
import { SEED_PLAYERS, type PlayerProfile, findByName, nameError, resolveSeats } from './players';
import type { SavedGame } from './storage';

const profile = (id: string, name: string): PlayerProfile => ({ id, name, createdAt: 0 });
const BASE = [profile('pl_s', 'Сергей'), profile('pl_m', 'Мика'), profile('pl_p', 'Паша')];

describe('база игроков', () => {
  it('первые игроки клуба', () => {
    expect(SEED_PLAYERS).toEqual(['Сергей', 'Мика', 'Паша', 'Ира', 'Ульяна', 'Вова', 'Оля']);
  });

  it('имя находится без учёта регистра и лишних пробелов', () => {
    expect(findByName(BASE, '  мИка ')?.id).toBe('pl_m');
    expect(findByName(BASE, '')).toBeUndefined();
  });

  it('нельзя завести второго игрока с тем же именем', () => {
    expect(nameError(BASE, 'сергей')).toBe('Сергей уже есть в базе');
    expect(nameError(BASE, 'Сергей', 'pl_s')).toBeNull();
    expect(nameError(BASE, '   ')).toBe('Введите имя');
  });

  it('места за столом: известные — из базы, новые — в базу, пустые — гости', () => {
    const r = resolveSeats(['Паша', 'Оля', '', 'мика', 'Ира'], BASE, 100);
    expect(r.error).toBeNull();
    expect(r.players.map((p) => p.id)).toEqual(['pl_p', r.created[0]?.id, 'guest_3', 'pl_m', r.created[1]?.id]);
    expect(r.players[3]?.name).toBe('Мика');
    expect(r.created.map((p) => p.name)).toEqual(['Оля', 'Ира']);
  });

  it('один игрок не может сидеть за столом дважды', () => {
    expect(resolveSeats(['Паша', 'паша'], BASE).error).toBe('Паша записан за столом дважды');
    expect(resolveSeats(['Новый', 'новый'], BASE).error).toBe('Новый записан за столом дважды');
  });
});

// ---------- Stats ----------

let seq = 0;
function playedGame(
  seats: { id: string; name: string; role: Role }[],
  finish: 'town' | 'aborted' | 'unfinished',
  date: number,
): SavedGame {
  const composition = emptyComposition();
  for (const s of seats) composition[s.role]++;
  const create: GameEvent = {
    type: 'CreateGame',
    settings: CLASSIC_SETTINGS,
    players: seats.map(({ id, name }) => ({ id, name })),
    composition,
    dealing: 'cards',
    roles: seats.map((s) => s.role),
  };
  const r = newGame(create);
  if (!r.ok) throw new Error(r.error.message);
  let game = r.value;
  const mafia = seats.find((s) => s.role === 'mafia');
  if (finish === 'town' && mafia) {
    const d = dispatch(game, { type: 'RemovePlayer', playerId: mafia.id, cause: 'left' });
    if (!d.ok) throw new Error(d.error.message);
    game = d.value;
  } else if (finish === 'aborted') {
    const d = dispatch(game, { type: 'EndGame', result: 'aborted' });
    if (!d.ok) throw new Error(d.error.message);
    game = d.value;
  }
  return { id: `g${++seq}`, createdAt: date, finishedAt: finish === 'unfinished' ? undefined : date, events: game.events };
}

const others = (prefix: string): { id: string; name: string; role: Role }[] => [
  { id: `${prefix}2`, name: 'Ира', role: 'civilian' },
  { id: `${prefix}3`, name: 'Вова', role: 'civilian' },
  { id: `${prefix}4`, name: 'Оля', role: 'commissar' },
];

describe('статистика игрока', () => {
  const sergey = BASE[0] as PlayerProfile;
  const history: SavedGame[] = [
    // Мафия, город победил → поражение, выбыл (ушёл).
    playedGame([{ id: 'pl_s', name: 'Сергей', role: 'mafia' }, { id: 'x1', name: 'Мика', role: 'civilian' }, ...others('a')], 'town', 1000),
    // Мирный, город победил → победа, дожил до конца.
    playedGame([{ id: 'pl_s', name: 'Сергей', role: 'civilian' }, { id: 'x1', name: 'Мика', role: 'mafia' }, ...others('b')], 'town', 2000),
    // Партия до появления базы: id p1, имя совпадает → засчитывается.
    playedGame([{ id: 'p1', name: 'сергей', role: 'civilian' }, { id: 'p5', name: 'Мика', role: 'mafia' }, ...others('c')], 'town', 3000),
    // Прерванная и неоконченная — не считаются.
    playedGame([{ id: 'pl_s', name: 'Сергей', role: 'civilian' }, { id: 'x1', name: 'Мика', role: 'mafia' }, ...others('d')], 'aborted', 4000),
    playedGame([{ id: 'pl_s', name: 'Сергей', role: 'civilian' }, { id: 'x1', name: 'Мика', role: 'mafia' }, ...others('e')], 'unfinished', 5000),
  ];

  it('считает игры, победы, команды и роли', () => {
    const s = playerStats(sergey, finishedGames(history));
    expect(s.games).toBe(3);
    expect(s.wins).toBe(2);
    expect(s.winRate).toBeCloseTo(2 / 3);
    expect(s.byTeam.mafia).toEqual({ games: 1, wins: 0 });
    expect(s.byTeam.town).toEqual({ games: 2, wins: 2 });
    expect(s.roles.civilian).toBe(2);
    expect(s.roles.mafia).toBe(1);
    expect(s.favoriteRole).toBe('civilian');
    expect(s.survived).toBe(2);
    expect(s.removed).toBe(1);
    expect(s.lastPlayed).toBe(3000);
    expect(s.history.map((h) => h.date)).toEqual([3000, 2000, 1000]);
  });

  it('после переименования профиль находит свои партии по id', () => {
    const s = playerStats({ ...sergey, name: 'Серёжа' }, finishedGames(history));
    expect(s.games).toBe(2); // старая партия по имени «сергей» больше не совпадает
  });

  it('игрок без партий', () => {
    const s = playerStats(profile('pl_u', 'Ульяна'), finishedGames(history));
    expect(s.games).toBe(0);
    expect(s.winRate).toBeNull();
    expect(s.favoriteRole).toBeNull();
  });
});
