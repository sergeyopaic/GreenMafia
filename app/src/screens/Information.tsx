import { lazy, Suspense } from 'react';
import { IconBack } from '../components/icons';
import { useT } from '../i18n';
import { useApp } from '../store';
const LicenseTexts = lazy(() => import('./LicenseTexts'));

export function InformationScreen({ page }: { page: 'privacy' | 'licenses' }) {
  const t = useT();
  const s = t.preferences;
  const title = page === 'privacy' ? s.privacy : s.licenses;
  return (
    <main className="screen settings" aria-labelledby="information-title">
      <header className="topbar">
        <button type="button" className="icon-btn" onClick={() => useApp.getState().go({ name: 'settings' })} aria-label={t.common.back}><IconBack /></button>
        <h1 id="information-title" className="settings__title">{title}</h1>
      </header>
      {page === 'privacy' ? <>
        {[s.local, s.network, s.exports, s.device].map((section) => <section key={section.title} className="settings__section">
          <h2>{section.title}</h2><p>{section.text}</p>
        </section>)}
      </> : <Suspense fallback={<p role="status">{s.loadingLicenses}</p>}><LicenseTexts /></Suspense>}
    </main>
  );
}
