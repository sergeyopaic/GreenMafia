import { useState } from 'react';
import { IconBack } from '../components/icons';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { useT } from '../i18n';
import { APP_VERSION, BUILD_ID, SUPPORT_URL } from '../lib/appInfo';
import { exportDeviceData } from '../lib/exportData';
import { useApp } from '../store';
import { ImportPanel } from '../components/ImportPanel';
import { CleanupPanel } from '../components/CleanupPanel';
import { KEEP_AWAKE_MODES, wakeLockSupported } from '../lib/wakeLock';

export function SettingsScreen() {
  const t = useT();
  const s = t.preferences;
  const { go, sound, vibration, toggleSound, toggleVibration, keepAwake, setKeepAwake } = useApp();
  const [exporting, setExporting] = useState(false);
  return (
    <main className="screen settings" aria-labelledby="settings-title">
      <header className="topbar">
        <button type="button" className="icon-btn" onClick={() => go({ name: 'home' })} aria-label={t.common.back}><IconBack /></button>
        <h1 id="settings-title" className="settings__title">{s.title}</h1>
      </header>
      <section className="settings__section" aria-labelledby="settings-language">
        <h2 id="settings-language">{t.home.language}</h2>
        <LanguageSwitch />
      </section>
      <section className="settings__section" aria-labelledby="settings-signals">
        <h2 id="settings-signals">{s.signals}</h2>
        <label className="settings__toggle"><span>{s.sound}</span><input type="checkbox" checked={sound} onChange={toggleSound} /></label>
        <label className="settings__toggle"><span>{s.vibration}</span><input type="checkbox" checked={vibration} onChange={toggleVibration} /></label>
        <p className="list__sub">{s.signalsHint}</p>
      </section>
      <section className="settings__section" aria-labelledby="settings-screen">
        <h2 id="settings-screen">{s.screen}</h2>
        <div className="field__label" id="settings-keep-awake">{s.keepAwake}</div>
        <div className="seg" role="group" aria-labelledby="settings-keep-awake">
          {KEEP_AWAKE_MODES.map((mode) => (
            <button type="button" key={mode} aria-pressed={keepAwake === mode} onClick={() => setKeepAwake(mode)}>{s.keepAwakeModes[mode]}</button>
          ))}
        </div>
        <p className="list__sub">{wakeLockSupported() ? s.keepAwakeHint : s.keepAwakeUnsupported}</p>
      </section>
      <section className="settings__section" aria-labelledby="settings-data">
        <h2 id="settings-data">{s.data}</h2>
        <p>{s.dataHint}</p>
        <div className="actions">
          <button type="button" className="btn btn--secondary" onClick={() => go({ name: 'backups', back: 'settings' })}>{t.recovery.backupsTitle}</button>
          <button type="button" className="btn btn--secondary" disabled={exporting} onClick={async () => {
            setExporting(true);
            try { await exportDeviceData(); } catch { useApp.getState().showToast(t.recovery.exportFailed); }
            finally { setExporting(false); }
          }}>{exporting ? s.exporting : t.recovery.exportDevice}</button>
        </div>
        <p className="list__sub">{t.recovery.exportPrivacy}</p>
        <p className="list__sub">{s.importHint}</p>
      </section>
      <ImportPanel />
      <CleanupPanel />
      <section className="settings__section" aria-labelledby="settings-help">
        <h2 id="settings-help">{s.help}</h2>
        <p className="list__sub">{s.supportHint}</p>
        <a className="btn btn--secondary" href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">{s.support}</a>
        <button type="button" className="btn btn--secondary" onClick={() => go({ name: 'privacy' })}>{s.privacy}</button>
      </section>
      <section className="settings__section" aria-labelledby="settings-about">
        <h2 id="settings-about">{s.about}</h2>
        <p>{s.version(APP_VERSION)}{BUILD_ID && <span className="list__sub"> · {BUILD_ID.slice(0, 8)}</span>}</p>
        <button type="button" className="btn btn--secondary" onClick={() => go({ name: 'licenses' })}>{s.licenses}</button>
      </section>
    </main>
  );
}
