import { useApp } from '../store';

/** Cover synchronously before React renders, then clear every ephemeral secret and pause. */
export function installAppLifecycle(host: Window = window, page: Document = document): () => void {
  const cover = () => {
    page.documentElement.dataset.privacy = 'covered';
    useApp.getState().suspend();
  };
  const uncover = () => {
    if (page.hidden) return;
    delete page.documentElement.dataset.privacy;
    useApp.getState().uncover();
  };
  const visibility = () => {
    if (page.hidden) cover();
    else if (page.hasFocus()) uncover();
  };
  host.addEventListener('blur', cover);
  host.addEventListener('pagehide', cover);
  host.addEventListener('focus', uncover);
  page.addEventListener('visibilitychange', visibility);
  if (page.hidden || !page.hasFocus()) cover();
  return () => {
    host.removeEventListener('blur', cover);
    host.removeEventListener('pagehide', cover);
    host.removeEventListener('focus', uncover);
    page.removeEventListener('visibilitychange', visibility);
  };
}
