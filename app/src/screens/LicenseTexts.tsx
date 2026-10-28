import { useT } from '../i18n';
import projectLicense from '../../../LICENSE.md?raw';
import stampLicense from '../assets/RUBIK-DIRT-LICENSE.txt?raw';
import notices from '../assets/licenses/third-party.json';

/** Loaded when opened; the production offline cache includes this chunk. */
export default function LicenseTexts() {
  const s = useT().preferences;
  return <>
    <p>{s.licenseHint}</p>
    <details className="license-notice"><summary>{s.projectLicense}</summary><pre>{projectLicense}</pre></details>
    <details className="license-notice"><summary>Rubik Dirt — {s.stampFont}</summary><pre>{stampLicense}</pre></details>
    <h2>{s.thirdParty}</h2>
    {notices.map((notice) => <details className="license-notice" key={`${notice.name}@${notice.version}`}>
      <summary>{notice.name} · {notice.version} · {notice.license}</summary><pre>{notice.text}</pre>
    </details>)}
  </>;
}
