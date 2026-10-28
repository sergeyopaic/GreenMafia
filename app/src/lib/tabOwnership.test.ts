import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); });

/** Model the browser's origin-scoped lock registry, shared by independent page modules. */
function browserLocks() {
  let occupied = false;
  let terminate: (() => void) | null = null;
  const request = vi.fn((_name: string, _options: LockOptions, callback: LockGrantedCallback<unknown>) => {
    if (occupied) return Promise.resolve(callback(null));
    occupied = true;
    return new Promise<void>((resolve, reject) => {
      terminate = () => { occupied = false; reject(new Error('Page terminated')); };
      Promise.resolve(callback({ name: _name, mode: 'exclusive' } as Lock)).then(() => {
        occupied = false;
        resolve();
      }, reject);
    });
  });
  return { provider: { request } as unknown as Pick<LockManager, 'request'>, request, closeOwner: () => terminate?.() };
}

describe('одна вкладка владеет записью', () => {
  it('даёт первой странице исключительное право, вторую блокирует вместе с записью', async () => {
    const locks = browserLocks();
    const first = await import('./tabOwnership');
    expect(await first.claimTabOwnership(locks.provider)).toBe(true);
    const firstStorage = await import('./persistence');
    vi.resetModules();
    const second = await import('./tabOwnership');
    expect(await second.claimTabOwnership(locks.provider)).toBe(false);
    expect(second.useTabOwnership.getState().status).toBe('blocked');
    const secondStorage = await import('./persistence');
    const primaryWrite = vi.fn().mockResolvedValue(undefined);
    const staleWrite = vi.fn().mockResolvedValue(undefined);
    expect(await firstStorage.writeStored('game', primaryWrite)).toBe(true);
    expect(await secondStorage.writeStored('game', staleWrite)).toBe(false);
    expect(primaryWrite).toHaveBeenCalledOnce();
    expect(staleWrite).not.toHaveBeenCalled();
    expect(first.mayWrite()).toBe(true);
    locks.closeOwner();
  });

  it('после закрытия первой страницы требует перезапуск второй с новым чтением данных', async () => {
    const locks = browserLocks();
    const first = await import('./tabOwnership');
    await first.claimTabOwnership(locks.provider);
    vi.resetModules();
    const second = await import('./tabOwnership');
    await second.claimTabOwnership(locks.provider);
    locks.closeOwner();
    await Promise.resolve();
    expect(first.mayWrite()).toBe(false);
    expect(await second.claimTabOwnership(locks.provider)).toBe(false); // No stale-state takeover.
    vi.resetModules();
    const reloaded = await import('./tabOwnership');
    expect(await reloaded.claimTabOwnership(locks.provider)).toBe(true);
    locks.closeOwner();
  });

  it('повторная инициализация одной страницы использует тот же запрос', async () => {
    const locks = browserLocks();
    const owner = await import('./tabOwnership');
    const first = owner.claimTabOwnership(locks.provider);
    expect(owner.claimTabOwnership(locks.provider)).toBe(first);
    expect(await first).toBe(true);
    expect(locks.request).toHaveBeenCalledOnce();
    locks.closeOwner();
  });

  it('при отсутствии поддержки или отказе API не разрешает небезопасную запись', async () => {
    const unsupported = await import('./tabOwnership');
    expect(await unsupported.claimTabOwnership(null)).toBe(false);
    expect(unsupported.useTabOwnership.getState().status).toBe('unsupported');
    expect(unsupported.mayWrite()).toBe(false);
    vi.resetModules();
    const failed = await import('./tabOwnership');
    expect(await failed.claimTabOwnership({ request: () => { throw new Error('Permission denied'); } } as Pick<LockManager, 'request'>)).toBe(false);
    expect(failed.useTabOwnership.getState().status).toBe('failed');
    expect(failed.mayWrite()).toBe(false);
    vi.resetModules();
    const rejected = await import('./tabOwnership');
    expect(await rejected.claimTabOwnership({ request: () => Promise.reject(new Error('Denied')) } as Pick<LockManager, 'request'>)).toBe(false);
    expect(rejected.mayWrite()).toBe(false);
  });

  it('отбрасывает ожидающую запись, если право потеряно до её выполнения', async () => {
    const locks = browserLocks();
    const owner = await import('./tabOwnership');
    await owner.claimTabOwnership(locks.provider);
    const { writeStored } = await import('./persistence');
    let release!: () => void;
    const first = writeStored('prefs', () => new Promise<void>((resolve) => { release = resolve; }));
    const stale = vi.fn().mockResolvedValue(undefined);
    const second = writeStored('game', stale);
    await Promise.resolve();
    locks.closeOwner();
    await Promise.resolve();
    release();
    await first;
    expect(await second).toBe(false);
    expect(stale).not.toHaveBeenCalled();
  });
});
