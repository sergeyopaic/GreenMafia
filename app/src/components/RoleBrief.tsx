import type { Role, Settings } from '@greenmafia/engine';
import { firstNightBrief, roleBrief } from '../lib/roleBrief';

export function RoleBrief({ role, settings, firstNight = false }: { role: Role; settings: Settings; firstNight?: boolean }) {
  const brief = roleBrief(role, settings);
  return (
    <div className="role-brief">
      <p>{brief.action}</p>
      {brief.rules.length > 0 && <ul>{brief.rules.map((rule) => <li key={rule}>{rule}</li>)}</ul>}
      <p><b>Ваша цель.</b> {brief.goal}</p>
      {firstNight && <p className="role-brief__first">{firstNightBrief(settings)}</p>}
    </div>
  );
}
