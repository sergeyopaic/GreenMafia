import { create } from 'zustand';

export type OwnershipStatus = 'checking' | 'owner' | 'blocked' | 'unsupported' | 'failed';
export const useTabOwnership = create<{ status: OwnershipStatus }>(() => ({ status: 'checking' }));
const LOCK_NAME = 'greenmafia-device-writer-v1';
let claim: Promise<boolean> | null = null;

export const mayWrite = () => useTabOwnership.getState().status === 'owner';

/** Keep one writer for the page lifetime. Backgrounding does not hand over stale state.
 * Closing the page/process releases the browser lock; a second page must reload fresh data. */
export function claimTabOwnership(locks: Pick<LockManager, 'request'> | null | undefined = typeof navigator === 'undefined' ? undefined : navigator.locks): Promise<boolean> {
  if (claim) return claim;
  if (!locks) {
    useTabOwnership.setState({ status: 'unsupported' });
    claim = Promise.resolve(false);
    return claim;
  }
  claim = new Promise<boolean>((resolve) => {
    try {
      const request = locks.request(LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
        if (!lock) {
          useTabOwnership.setState({ status: 'blocked' });
          resolve(false);
          return;
        }
        useTabOwnership.setState({ status: 'owner' });
        resolve(true);
        // The browser, rather than a throttled heartbeat, owns the lifetime of this lock.
        await new Promise<void>(() => {});
      });
      void request.catch(() => {
        useTabOwnership.setState({ status: 'failed' });
        resolve(false);
      });
    } catch {
      useTabOwnership.setState({ status: 'failed' });
      resolve(false);
    }
  });
  return claim;
}
