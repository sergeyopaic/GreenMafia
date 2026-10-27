import { type GameState, publicIdentity } from '@greenmafia/engine';
import { useT } from '../i18n';

/** What may be announced about an out player, by `revealRoleOnDeath`. */
export function IdentityLine({ state, playerId }: { state: GameState; playerId: string }) {
  const t = useT();
  const id = publicIdentity(state, playerId);
  if (id.role) return <span>{t.identity.role(t.roles.name[id.role])}</span>;
  if (id.team) return <span>{t.identity.team(t.roles.team[id.team])}</span>;
  return <span className="muted">{t.identity.hidden}</span>;
}
