import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get, set, setMany } from 'idb-keyval';
import legacy from './fixtures/legacy-game.json';

const memory = vi.hoisted(() => new Map<unknown, unknown>());
const access = vi.hoisted(() => ({ owner: true }));
vi.mock('idb-keyval', () => ({ get: vi.fn(), set: vi.fn(), setMany: vi.fn() }));
vi.mock('./sound', () => ({ setSoundContext: vi.fn(), setSoundEnabled: vi.fn(), setVibrationEnabled: vi.fn() }));
vi.mock('./tabOwnership', () => ({ mayWrite: () => access.owner }));

beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks(); memory.clear(); access.owner = true;
  vi.stubGlobal('window', { scrollTo: vi.fn() });
  vi.mocked(get).mockImplementation(async (key) => structuredClone(memory.get(key)));
  vi.mocked(set).mockImplementation(async (key, value) => { memory.set(key, structuredClone(value)); });
  vi.mocked(setMany).mockImplementation(async (entries) => { for (const [key, value] of entries) memory.set(key, structuredClone(value)); });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('новая установка и существующие локальные профили', () => {
  it('первое и параллельные чтения не создают чужие профили и не пишут начальную базу', async () => {
    const { loadPlayers } = await import('./players');
    expect(await Promise.all([loadPlayers(), loadPlayers()])).toEqual([[], []]);
    expect(memory.has('gm.players')).toBe(false);
    expect(set).not.toHaveBeenCalled(); expect(setMany).not.toHaveBeenCalled();
  });

  it.each([{ profiles: [] }, { profiles: [{ id: 'pl_club', name: 'Сохранённый игрок', createdAt: 123 }] }])('сохраняет существующую базу без переписывания: $profiles', async ({ profiles }) => {
    memory.set('gm.players', profiles);
    const before = structuredClone(profiles);
    const { loadPlayers } = await import('./players');
    expect(await loadPlayers()).toEqual(before);
    expect(memory.get('gm.players')).toEqual(before); expect(set).not.toHaveBeenCalled();
  });

  it.each(['read-failure', 'damaged'] as const)('ошибка базы %s блокирует изменения без заполнения начальными данными', async (kind) => {
    if (kind === 'read-failure') vi.mocked(get).mockRejectedValueOnce(new Error('Read failed'));
    else memory.set('gm.players', { damaged: 'original' });
    const { loadPlayers } = await import('./players');
    const { useStorageHealth } = await import('./persistence');
    expect(await loadPlayers()).toEqual([]);
    expect(useStorageHealth.getState().readErrors).toContain('gm.players');
    expect(set).not.toHaveBeenCalled(); expect(setMany).not.toHaveBeenCalled();
    if (kind === 'damaged') expect(memory.get('gm.players')).toEqual({ damaged: 'original' });
  });
});

describe('знакомство без регистрации и вмешательства в партии', () => {
  it.each([true, false])('в старых настройках звук %s определяет начальную вибрацию без внезапного включения', async (sound) => {
    memory.set('gm.prefs', { sound, introSeen: true, lang: 'ru' });
    const { useApp } = await import('../store'); await useApp.getState().init();
    expect(useApp.getState().vibration).toBe(sound);
    expect(set).not.toHaveBeenCalled();
  });

  it('раздельные сигналы сохраняются после смены языка и перезапуска без изменения игровых данных', async () => {
    memory.set('gm.prefs', { sound: true, introSeen: true, lang: 'ru' }); memory.set('gm.current', legacy);
    const { useApp } = await import('../store'); const { flushStorage } = await import('./persistence');
    await useApp.getState().init(); useApp.getState().toggleSound(); useApp.getState().toggleVibration();
    useApp.getState().toggleVibration(); useApp.getState().setLang('en'); await flushStorage();
    expect(memory.get('gm.prefs')).toEqual({ sound: false, vibration: true, lang: 'en', introSeen: true, keepAwake: 'game' });
    vi.resetModules(); const restarted = (await import('../store')).useApp; await restarted.getState().init();
    expect(restarted.getState()).toMatchObject({ sound: false, vibration: true, lang: 'en', introSeen: true });
    expect(memory.get('gm.current')).toEqual(legacy); expect(memory.has('gm.players')).toBe(false);
  });

  it('на первом запуске открывает знакомство на выбранном языке, не создавая данные', async () => {
    memory.set('gm.prefs', { sound: false, lang: 'en' });
    const { useApp } = await import('../store'); await useApp.getState().init();
    expect(useApp.getState()).toMatchObject({ ready: true, lang: 'en', sound: false, introSeen: false, screen: { name: 'welcome' } });
    expect(set).not.toHaveBeenCalled(); expect(setMany).not.toHaveBeenCalled();
  });

  it.each(['home', 'setup'] as const)('явное завершение ведёт в %s; язык и звук не сбрасывают отметку при следующем запуске', async (destination) => {
    const { useApp } = await import('../store'); const { flushStorage } = await import('./persistence');
    await useApp.getState().init(); useApp.getState().finishIntro(destination);
    useApp.getState().setLang('en'); useApp.getState().toggleSound(); await flushStorage();
    expect(useApp.getState().screen.name).toBe(destination);
    expect(memory.get('gm.prefs')).toEqual({ introSeen: true, lang: 'en', sound: false, vibration: true, keepAwake: 'game' });
    expect([...memory.keys()]).toEqual(['gm.prefs']);
    vi.resetModules(); const restarted = (await import('../store')).useApp;
    await restarted.getState().init();
    expect(restarted.getState()).toMatchObject({ introSeen: true, lang: 'en', sound: false, screen: { name: 'home' } });
  });

  it.each([legacy, { broken: 'original' }, { ...legacy, schemaVersion: 99 }])('продолжение и восстановление имеют приоритет над знакомством', async (current) => {
    memory.set('gm.current', structuredClone(current));
    const { useApp } = await import('../store'); await useApp.getState().init();
    expect(useApp.getState().screen.name).toBe('home');
    expect(useApp.getState().resumable || useApp.getState().currentRecovery).toBeTruthy();
    expect(memory.get('gm.current')).toEqual(current); expect(set).not.toHaveBeenCalled();
  });

  it('повторное открытие не меняет архив, профили, настройки подготовки и текущую партию', async () => {
    memory.set('gm.players', [{ id: 'pl_original', name: 'Игрок', createdAt: 1 }]);
    memory.set('gm.history', [legacy]); memory.set('gm.lastSetup', { original: 'setup' }); memory.set('gm.current', legacy);
    const before = structuredClone([...memory]);
    const { useApp } = await import('../store'); const { flushStorage } = await import('./persistence');
    await useApp.getState().init(); useApp.getState().go({ name: 'welcome' }); useApp.getState().finishIntro('home'); await flushStorage();
    for (const [key, value] of before) expect(memory.get(key)).toEqual(value);
    expect(useApp.getState().resumable!.id).toBe(legacy.id);
  });

  it('отказ записи отметки виден и повторяем; партия и профили не создаются', async () => {
    const { useApp } = await import('../store'); const { flushStorage, retryStorage, useStorageHealth } = await import('./persistence');
    await useApp.getState().init(); vi.mocked(set).mockRejectedValueOnce(new Error('Disk full'));
    useApp.getState().finishIntro('home'); await flushStorage();
    expect(useStorageHealth.getState().writeErrors).toEqual(['prefs']);
    expect(memory.size).toBe(0); expect(useApp.getState().screen.name).toBe('home');
    await retryStorage(); expect(memory.get('gm.prefs')).toMatchObject({ introSeen: true });
    expect(useStorageHealth.getState().writeErrors).toEqual([]);
  });

  it('без права записи завершение знакомства не меняет настройки', async () => {
    const { useApp } = await import('../store'); await useApp.getState().init(); access.owner = false;
    useApp.getState().finishIntro('setup');
    expect(useApp.getState().introSeen).toBe(false); expect(useApp.getState().screen.name).toBe('welcome');
    expect(set).not.toHaveBeenCalled();
  });
});
