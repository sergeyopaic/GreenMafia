import type { Role } from '@greenmafia/engine';
import type { ReactElement, SVGProps } from 'react';
import { roleIcon } from '../lib/assets';

type P = SVGProps<SVGSVGElement>;

function Svg({ children, ...rest }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconUndo = (p: P) => (
  <Svg {...p}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Svg>
);
export const IconPause = (p: P) => (
  <Svg {...p}>
    <path d="M9 5v14M15 5v14" />
  </Svg>
);
export const IconPlay = (p: P) => (
  <Svg {...p}>
    <path d="M7 4.5v15l12-7.5z" />
  </Svg>
);
export const IconEye = (p: P) => (
  <Svg {...p}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);
export const IconMenu = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h10" />
  </Svg>
);
export const IconRestart = (p: P) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 4v4h4" />
  </Svg>
);
export const IconClose = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
export const IconBack = (p: P) => (
  <Svg {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
);
export const IconDoor = (p: P) => (
  <Svg {...p}>
    <path d="M14 4H6v16h8" />
    <path d="M10 12h10M17 9l3 3-3 3" />
  </Svg>
);
export const IconBan = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M6 6l12 12" />
  </Svg>
);
export const IconFlag = (p: P) => (
  <Svg {...p}>
    <path d="M6 21V4M6 4h11l-2.5 4L17 12H6" />
  </Svg>
);
export const IconScale = (p: P) => (
  <Svg {...p}>
    <path d="M12 4v16M7 20h10M5 8h14" />
    <path d="M5 8l-2.5 6a3 3 0 0 0 5 0zM19 8l-2.5 6a3 3 0 0 0 5 0z" />
  </Svg>
);
export const IconHome = (p: P) => (
  <Svg {...p}>
    <path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z" />
  </Svg>
);
export const IconSound = ({ off, ...p }: P & { off?: boolean }) => (
  <Svg {...p}>
    <path d="M4 9h4l5-4v14l-5-4H4z" />
    {off ? <path d="M17 9l5 6M22 9l-5 6" /> : <path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12" />}
  </Svg>
);
export const IconStop = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="5" width="14" height="14" rx="1.5" />
  </Svg>
);

// ---------- Role icons ----------

const ROLE_PATHS: Record<Role, ReactElement> = {
  civilian: (
    <>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M10 20v-5.5h4V20" />
    </>
  ),
  mafia: (
    <>
      <path d="M2.5 15.5c4 2.6 15 2.6 19 0" />
      <path d="M5.5 15c0-5 1.2-8.5 3.5-8.5 1.2 0 2 1 3 1s1.8-1 3-1c2.3 0 3.5 3.5 3.5 8.5" />
      <path d="M6 12.5c3.5 1 8.5 1 12 0" />
    </>
  ),
  commissar: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6.5l1.6 3.4 3.7.4-2.8 2.5.8 3.7L12 14.6l-3.3 1.9.8-3.7-2.8-2.5 3.7-.4z" />
    </>
  ),
  doctor: (
    <>
      <path d="M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6z" />
    </>
  ),
  lover: (
    <>
      <path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" />
      <path d="M9 10.5c.5-1 1.5-1.5 2.5-1.2" />
    </>
  ),
  maniac: (
    <>
      <path d="M4.5 19.5l5-5" />
      <path d="M8 13l3 3" />
      <path d="M10.5 14.5 19 4c1 4-.5 8.5-5.5 13.5z" />
    </>
  ),
};

/** Role icon: the drawn SVG from assets if present, otherwise the built-in one. Inherits `color`. */
export function RoleIcon({ role, ...p }: P & { role: Role }) {
  const url = roleIcon(role);
  if (url) {
    const size = p.width ?? '1em';
    return (
      <span
        aria-hidden="true"
        className={p.className}
        style={{
          display: 'inline-block',
          width: size,
          height: p.height ?? size,
          background: 'currentColor',
          WebkitMask: `url("${url}") center / contain no-repeat`,
          mask: `url("${url}") center / contain no-repeat`,
        }}
      />
    );
  }
  return <Svg {...p}>{ROLE_PATHS[role]}</Svg>;
}
