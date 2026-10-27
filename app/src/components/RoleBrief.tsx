import type { Role, Settings } from '@greenmafia/engine';
import { useT } from '../i18n';
import { GOAL_LABEL, firstNightBrief, roleBrief } from '../lib/roleBrief';

export function RoleBrief({ role, settings, firstNight = false }: { role: Role; settings: Settings; firstNight?: boolean }) {
  const t = useT();
  const brief = roleBrief(role, settings, t.code);
  return (
    <div className="role-brief">
      <p>{brief.action}</p>
      {brief.rules.length > 0 && <ul>{brief.rules.map((rule) => <li key={rule}>{rule}</li>)}</ul>}
      <p>
        <b>{GOAL_LABEL[t.code]}</b> {brief.goal}
      </p>
      {firstNight && <p className="role-brief__first">{firstNightBrief(settings, t.code)}</p>}
    </div>
  );
}
