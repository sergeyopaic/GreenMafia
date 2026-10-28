import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import legacy from './fixtures/legacy-game.json';

const access = vi.hoisted(() => ({ owner: true }));
vi.mock('./tabOwnership', () => ({ mayWrite: () => access.owner, useTabOwnership: { getState: () => ({ status: access.owner ? 'owner' : 'failed' }) } }));
vi.mock('./sound', () => ({ setSoundContext: vi.fn(), setSoundEnabled: vi.fn(), setVibrationEnabled: vi.fn() }));
const database = new IDBFactory();
beforeEach(async () => {
  vi.resetModules(); access.owner = true; vi.stubGlobal('indexedDB', database); vi.stubGlobal('window', { scrollTo: vi.fn() });
  // idb-keyval caches a connection in its external module; all connections share this factory.
  await (await import('idb-keyval')).clear();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function api() {
  const format = await import('./deviceFormat');
  const transfer = await import('./importData');
  const idb = await import('idb-keyval');
  const persistence = await import('./persistence');
  return { ...format, ...transfer, ...idb, ...persistence };
}
function envelope(data: Record<string, unknown> = {}) { return { format: 'greenmafia-device-backup', version: 1, exportedAt: 100, data }; }
async function finished() {
  const { inspectGame } = await import('./saveFormat'); const { dispatch } = await import('@greenmafia/engine');
  const r = inspectGame(legacy); if (r.kind !== 'ready') throw new Error('Bad fixture');
  const end = dispatch(r.game, { type: 'EndGame', result: 'draw' }); if (!end.ok) throw new Error('Bad end');
  return { ...r.saved, id: 'finished', events: end.value.events, finishedAt: 200 };
}

describe('проверка импортируемых файлов', () => {
  it('выгрузка устройства проходит круговой перенос; старый формат мигрирует только в копии', async () => {
    const a = await api();
    const input = envelope({ 'gm.current': legacy, 'gm.players': [{ id: 'pl_old', name: 'Игрок', createdAt: 1 }], 'gm.history': [await finished()], 'gm.prefs': { sound: false } });
    const before = structuredClone(input); const plan = a.inspectImport(input);
    expect(plan).toMatchObject({ kind: 'device', profiles: 1, games: 1, backups: 0, hasCurrent: true });
    expect(plan.data['gm.current']).toMatchObject({ schemaVersion: 1, runtime: { paused: true } });
    expect(input).toEqual(before); expect(plan.original).toEqual(before);
    await a.commitImport(plan, undefined, () => true);
    const values = await a.getMany(a.DEVICE_KEYS.slice());
    const stored = Object.fromEntries(a.DEVICE_KEYS.map((key, i) => [key, values[i]]));
    expect(a.inspectImport(envelope(stored))).toMatchObject({ profiles: 1, games: 1, hasCurrent: true });
  });

  it.each([null, [], { format: 'unknown' }, envelope({ unknown: [] }), envelope({ 'gm.players': [{ id: 'p', name: 'P', createdAt: 'bad' }] }), envelope({ 'gm.prefs': { sound: 'on' } }), envelope({ 'gm.backups': [{}] })])('отклоняет неверный контейнер или раздел без записи: %j', async (raw) => {
    const a = await api(); expect(() => a.inspectImport(raw)).toThrow(); expect(await a.keys()).toEqual([]);
  });

  it('не обрезает повреждённый журнал и не допускает новые версии', async () => {
    const a = await api();
    expect(() => a.inspectImport({ ...legacy, events: [...legacy.events, { type: 'FutureAction' }] })).toThrow();
    expect(() => a.inspectImport({ ...legacy, schemaVersion: 99 })).toThrow(expect.objectContaining({ code: 'future' }));
    expect(() => a.inspectImport({ ...envelope(), version: 2 })).toThrow(expect.objectContaining({ code: 'future' }));
    expect(await a.keys()).toEqual([]);
  });

  it('отклоняет дубли имён/ID, незавершённый архив и конфликт текущей партии с архивом', async () => {
    const a = await api(); const final = await finished();
    for (const profiles of [
      [{ id: 'x', name: 'Один', createdAt: 0 }, { id: 'x', name: 'Два', createdAt: 0 }],
      [{ id: 'x', name: 'Один', createdAt: 0 }, { id: 'y', name: ' один ', createdAt: 0 }],
    ]) expect(() => a.inspectImport(envelope({ 'gm.players': profiles }))).toThrow();
    expect(() => a.inspectImport(envelope({ 'gm.history': [legacy] }))).toThrow();
    expect(() => a.inspectImport(envelope({ 'gm.history': [final, final] }))).toThrow();
    expect(() => a.inspectImport(envelope({ 'gm.current': { ...legacy, id: final.id }, 'gm.history': [final] }))).toThrow();
  });

  it('проверяет размер до чтения, JSON и BOM; отмена выбора не выполняет запись', async () => {
    const a = await api(); const text = vi.fn(async () => '{}');
    await expect(a.readImportFile({ size: a.MAX_IMPORT_BYTES + 1, text })).rejects.toMatchObject({ code: 'large' }); expect(text).not.toHaveBeenCalled();
    await expect(a.readImportFile({ size: 4, text: async () => 'oops' })).rejects.toMatchObject({ code: 'invalid' });
    expect(await a.readImportFile({ size: 100, text: async () => '\uFEFF' + JSON.stringify(legacy) })).toMatchObject({ kind: 'game', hasCurrent: true });
    expect(await a.keys()).toEqual([]);
  });
});

describe('атомарный импорт через IndexedDB', () => {
  it('сохраняет полную прежнюю базу и память, меняет все разделы и позволяет вернуть копию', async () => {
    const a = await api();
    const original = { 'gm.current': legacy, 'gm.players': [{ id: 'pl_keep', name: 'Старый', createdAt: 1 }], 'gm.prefs': { sound: true }, 'gm.history': [await finished()], 'gm.lastSetup': { raw: 'keep even damaged' }, 'gm.backups': [] };
    await a.setMany(Object.entries(original));
    const latest = { ...legacy, id: 'latest-memory' };
    const raw = envelope({ 'gm.players': [{ id: 'pl_new', name: 'Новый', createdAt: 2 }], 'gm.prefs': { sound: false } });
    await a.commitImport(a.inspectImport(raw), latest, () => true);
    expect(await a.get('gm.current')).toBeUndefined(); expect(await a.get('gm.history')).toEqual([]);
    expect(await a.get('gm.players')).toEqual(raw.data['gm.players']);
    const copies = await a.loadDeviceCopies(); expect(copies).toHaveLength(1);
    expect(copies[0]!.data).toEqual({ ...original, 'gm.current': latest }); expect(copies[0]!.source).toEqual(raw);
    // A damaged original remains exportable, while valid sections can be restored after inspection.
    const validCopy = { ...copies[0]!.data, 'gm.lastSetup': undefined };
    await a.commitImport(a.inspectImport(a.deviceEnvelope(validCopy)), undefined, () => true);
    expect(await a.get('gm.players')).toEqual(original['gm.players']); expect((await a.loadDeviceCopies())).toHaveLength(2);
    expect(await a.get(a.DEVICE_COPIES_KEY)).not.toHaveProperty('data.gm.deviceCopies');
  });

  it.each(['gm.deviceCopies', 'gm.players'])('откатывает всю транзакцию при синхронном отказе %s; автоповтор не запускает импорт', async (failureKey) => {
    const a = await api(); await a.setMany([['gm.current', legacy], ['gm.players', [{ id: 'old', name: 'Старый', createdAt: 1 }]], ['gm.prefs', { sound: true }]]);
    const before = await a.getMany([...a.DEVICE_KEYS, a.DEVICE_COPIES_KEY]);
    const nativePut = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      if (key === failureKey) throw new DOMException('Full', 'QuotaExceededError');
      return nativePut.call(this, value, key);
    });
    await expect(a.commitImport(a.inspectImport(envelope()), undefined, () => true)).rejects.toMatchObject({ code: 'storage' });
    expect(await a.getMany([...a.DEVICE_KEYS, a.DEVICE_COPIES_KEY])).toEqual(before);
    await a.retryStorage(); expect(await a.getMany([...a.DEVICE_KEYS, a.DEVICE_COPIES_KEY])).toEqual(before);
  });

  it('откатывает асинхронно прерванную транзакцию целиком', async () => {
    const a = await api(); await a.setMany([['gm.current', legacy], ['gm.prefs', { sound: true }]]);
    const before = await a.getMany([...a.DEVICE_KEYS, a.DEVICE_COPIES_KEY]); const nativePut = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      const request = nativePut.call(this, value, key);
      if (key === 'gm.current') request.addEventListener('success', () => this.transaction.abort());
      return request;
    });
    await expect(a.commitImport(a.inspectImport(envelope()), undefined, () => true)).rejects.toMatchObject({ code: 'storage' });
    expect(await a.getMany([...a.DEVICE_KEYS, a.DEVICE_COPIES_KEY])).toEqual(before);
  });

  it('сначала завершает очередь сохранения и не принимает новые записи в ходе замены', async () => {
    const a = await api(); let release!: () => void;
    const previous = a.writeStored('prefs', async () => { await new Promise<void>((resolve) => { release = resolve; }); await a.set('gm.prefs', { sound: false }); });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const imported = a.commitImport(a.inspectImport(envelope()), undefined, () => true);
    expect(await a.writeStored('prefs', async () => { throw new Error('Must not run'); })).toBe(false);
    release(); await previous; await imported;
    expect((await a.loadDeviceCopies())[0]!.data['gm.prefs']).toEqual({ sound: false });
  });

  it('смена права записи или отмена до транзакции не меняет данные', async () => {
    const a = await api(); await a.set('gm.current', legacy);
    await expect(a.commitImport(a.inspectImport(envelope()), undefined, () => false)).rejects.toMatchObject({ code: 'cancelled' });
    access.owner = false;
    await expect(a.commitImport(a.inspectImport(envelope()), undefined, () => true)).rejects.toMatchObject({ code: 'storage' });
    expect(await a.get('gm.current')).toEqual(legacy); expect(await a.get(a.DEVICE_COPIES_KEY)).toBeUndefined();
  });

  it('одиночная партия получает новый ID; финал добавляется в архив, не заменяя текущую', async () => {
    const a = await api(); await a.setMany([['gm.current', legacy], ['gm.players', [{ id: 'pl_keep', name: 'Игрок', createdAt: 1 }]]]);
    const final = await finished(); await a.commitImport(a.inspectImport(final), undefined, () => true);
    expect(await a.get('gm.current')).toEqual(legacy);
    const history = await a.get<import('./storage').SavedGame[]>('gm.history'); expect(history).toHaveLength(1); expect(history![0]!.id).not.toBe(final.id);
    await a.commitImport(a.inspectImport(legacy), undefined, () => true);
    expect(await a.get('gm.current')).toMatchObject({ runtime: { paused: true } }); expect((await a.get<import('./storage').SavedGame>('gm.current'))!.id).not.toBe(legacy.id);
    expect(await a.get('gm.players')).toEqual([{ id: 'pl_keep', name: 'Игрок', createdAt: 1 }]); expect(await a.get('gm.history')).toEqual(history);
  });

  it('очистка истории сохраняет последнюю партию и обратимую копию, не удаляя профили и настройки', async () => {
    const a = await api(); const final = await finished(); const profiles = [{ id: 'pl_keep', name: 'Игрок', createdAt: 1 }];
    await a.setMany([['gm.current', legacy], ['gm.history', [final]], ['gm.players', profiles], ['gm.prefs', { sound: false }]]);
    const latest = { ...legacy, id: 'latest-memory' };
    await a.commitClear('history', latest, () => true);
    expect(await a.get('gm.history')).toEqual([]); expect(await a.get('gm.current')).toEqual(latest);
    expect(await a.get('gm.players')).toEqual(profiles); expect(await a.get('gm.prefs')).toEqual({ sound: false });
    const copies = await a.loadDeviceCopies(); expect(copies[0]).toMatchObject({ operation: 'history-clear', source: null, data: { 'gm.history': [final], 'gm.current': latest } });
    await a.commitImport(a.inspectImport(a.deviceEnvelope(copies[0]!.data)), undefined, () => true);
    expect(await a.get('gm.history')).toEqual(expect.arrayContaining([expect.objectContaining({ id: final.id })]));
  });

  it.each(['history', 'all'] as const)('сбой %s не оставляет частично очищенную базу', async (scope) => {
    const a = await api(); await a.setMany([['gm.current', legacy], ['gm.history', [await finished()]], ['gm.players', [{ id: 'p', name: 'Игрок', createdAt: 1 }]]]);
    const before = await a.getMany([...a.DEVICE_KEYS, a.DEVICE_COPIES_KEY]);
    if (scope === 'history') {
      const put = IDBObjectStore.prototype.put;
      vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
        if (key === 'gm.history') throw new DOMException('Full', 'QuotaExceededError'); return put.call(this, value, key);
      });
    } else {
      const remove = IDBObjectStore.prototype.delete;
      vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (this: IDBObjectStore, key) {
        if (key === 'gm.players') throw new DOMException('Denied', 'UnknownError'); return remove.call(this, key);
      });
    }
    await expect(a.commitClear(scope, undefined, () => true)).rejects.toMatchObject({ code: 'storage' });
    expect(await a.getMany([...a.DEVICE_KEYS, a.DEVICE_COPIES_KEY])).toEqual(before);
  });

  it('полная очистка удаляет все семь разделов, не оставляет скрытой копии и не трогает чужие ключи', async () => {
    const a = await api(); await a.setMany([...a.DEVICE_KEYS.map((key) => [key, { personal: key }] as [IDBValidKey, unknown]), [a.DEVICE_COPIES_KEY, [{ personal: 'old copy' }]], ['other-app', 'keep']]);
    await a.commitClear('all', undefined, () => true);
    expect(await a.keys()).toEqual(['other-app']);
    vi.resetModules(); const { useApp } = await import('../store'); await useApp.getState().init();
    expect(useApp.getState()).toMatchObject({ game: null, resumable: null, screen: { name: 'welcome' }, sound: true });
    expect(await (await import('./players')).loadPlayers()).toEqual([]); expect(await a.keys()).toEqual(['other-app']);
  });

  it('полная очистка работает при прежней ошибке записи; старый автоповтор не возвращает данные', async () => {
    const a = await api(); await a.set('gm.prefs', { sound: true });
    let fail = true; const write = vi.fn(async () => { if (fail) throw new Error('Full'); await a.set('gm.players', [{ id: 'old', name: 'Вернулся', createdAt: 1 }]); });
    await a.writeStored('players', write); fail = false;
    const { useApp } = await import('../store'); await useApp.getState().init();
    await useApp.getState().clearData('all'); await a.retryStorage();
    expect(write).toHaveBeenCalledOnce(); expect(await a.keys()).toEqual([]);
    expect(useApp.getState()).toMatchObject({ importing: true, importComplete: true, game: null, resumable: null, dataOperation: 'all' });
  });

  it('после успеха store блокирует старую память до перезапуска, включая suspend и обработку сбоя', async () => {
    const a = await api(); const { useApp } = await import('../store');
    await useApp.getState().init(); useApp.getState().go({ name: 'settings' });
    await useApp.getState().importFile(a.inspectImport(envelope({ 'gm.prefs': { sound: false } })));
    expect(useApp.getState()).toMatchObject({ importing: true, importComplete: true });
    useApp.getState().toggleSound(); useApp.getState().go({ name: 'home' }); useApp.getState().suspend();
    const crash = await import('./crashRecovery'); crash.reportCrash(new Error('Fault after import'), 'event');
    expect(crash.recoverCrash('home')).toBe(false); await a.flushStorage();
    expect(await a.get('gm.prefs')).toEqual({ sound: false }); expect(await a.get('gm.current')).toBeUndefined();
  });
});

describe('профили правил в файле устройства', () => {
  it('переносятся вместе с данными, считаются в предпросмотре и проверяются', async () => {
    const a = await api();
    const { createProfile } = await import('./ruleProfiles'); const { CLASSIC_SETTINGS } = await import('@greenmafia/engine');
    const rules = createProfile([], 'Наш клуб', { ...CLASSIC_SETTINGS, tieRule: 'nobody' }, 5);
    const plan = a.inspectImport(envelope({ 'gm.ruleProfiles': rules }));
    expect(plan).toMatchObject({ kind: 'device', rules: 1 });
    await a.commitImport(plan, undefined, () => true);
    expect(await a.get('gm.ruleProfiles')).toEqual(rules);
    expect(() => a.inspectImport(envelope({ 'gm.ruleProfiles': [{ ...rules[0], settings: { tieRule: 'duel' } }] }))).toThrow();
    // An older file without profiles replaces them like the rest of the device data; the rollback copy keeps them.
    await a.commitImport(a.inspectImport(envelope({ 'gm.prefs': { sound: true } })), undefined, () => true);
    expect(await a.get('gm.ruleProfiles')).toEqual([]);
    expect((await a.loadDeviceCopies())[0]!.data['gm.ruleProfiles']).toEqual(rules);
  });
});
