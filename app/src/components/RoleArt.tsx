import type { Role } from '@greenmafia/engine';
import { roleArt } from '../lib/assets';
import { RoleIcon } from './icons';

// Equalize the reviewed set's average rendered luminance without altering source art.
const BRIGHTNESS: Record<Role, number> = { civilian: 0.70, mafia: 0.91, don: 0.84, commissar: 0.75, doctor: 0.71, lover: 0.74, maniac: 1 };

/** Card artwork from assets/roles/<role>.*, or a labelled placeholder until it is drawn. */
export function RoleArt({ role }: { role: Role | 'back' }) {
  const url = roleArt(role);
  if (url) return <img src={url} alt="" draggable={false} style={role === 'back' ? undefined : { filter: `brightness(${BRIGHTNESS[role]})` }} />;
  return <RoleArtPlaceholder role={role} />;
}

function RoleArtPlaceholder({ role }: { role: Role | 'back' }) {
  const id = `hatch-${role}`;
  return (
    <svg viewBox="0 0 200 260" preserveAspectRatio="xMidYMin meet" role="img" aria-label="Заглушка арта роли">
      <defs>
        <pattern id={id} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width="8" height="8" fill="#0f2e21" />
          <path d="M0 0v8" stroke="#154130" strokeWidth="3" />
        </pattern>
      </defs>
      <rect width="200" height="260" fill={`url(#${id})`} />
      <rect x="9" y="9" width="182" height="242" fill="none" stroke="#b4894a" strokeWidth="1.5" />
      <rect x="14" y="14" width="172" height="232" fill="none" stroke="#b4894a" strokeWidth="0.6" />
      {role === 'back' ? (
        <g fill="none" stroke="#b4894a" strokeWidth="1.2">
          <circle cx="100" cy="130" r="46" />
          <circle cx="100" cy="130" r="36" strokeDasharray="5 4" />
          <text x="100" y="142" textAnchor="middle" fill="#eee4cd" stroke="none" fontFamily="Oranienbaum" fontSize="34">
            GM
          </text>
        </g>
      ) : (
        <g transform="translate(46 66) scale(4.5)" color="#eee4cd">
          <RoleIcon role={role} width={24} height={24} strokeWidth={0.9} />
        </g>
      )}
      <text x="100" y="34" textAnchor="middle" fill="#b9d94a" fontFamily="Anonymous Pro" fontSize="9" letterSpacing="2.5">
        ЗАГЛУШКА
      </text>
      <text x="100" y="236" textAnchor="middle" fill="#9db0a3" fontFamily="Anonymous Pro" fontSize="8">
        src/assets/roles/{role} · 1024×1536
      </text>
    </svg>
  );
}
