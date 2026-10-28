import { DICTS, LANGS, useT } from '../i18n';
import { useApp } from '../store';

export function LanguageSwitch() {
  const lang = useApp((s) => s.lang);
  const setLang = useApp((s) => s.setLang);
  const t = useT();
  return <div className="lang-switch" role="group" aria-label={t.home.language}>
    {LANGS.map((l) => (
      <button type="button" key={l} aria-pressed={lang === l} onClick={() => setLang(l)} lang={l} title={DICTS[l].langName}>
        {l.toUpperCase()}
      </button>
    ))}
  </div>;
}
