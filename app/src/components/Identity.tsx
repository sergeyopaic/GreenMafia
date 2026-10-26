import { type GameState, publicIdentity } from '@greenmafia/engine';
import { ROLE_NAME, TEAM_NAME } from '../lib/text';

/** What may be announced about an out player, by `revealRoleOnDeath`. */
export function IdentityLine({ state, playerId }: { state: GameState; playerId: string }) {
  const id = publicIdentity(state, playerId);
  if (id.role) return <span>Роль: {ROLE_NAME[id.role]}</span>;
  if (id.team) return <span>Команда: {TEAM_NAME[id.team]}</span>;
  return <span className="muted">Роль не раскрывается</span>;
}
