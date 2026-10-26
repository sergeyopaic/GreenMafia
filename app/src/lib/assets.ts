// Asset registry (GAME_DESIGN.md §17).
// Drop a file into app/src/assets/<path> and it is picked up automatically; until then the UI draws a placeholder.

import type { Role } from '@greenmafia/engine';

const files = import.meta.glob('/src/assets/**/*.{webp,png,jpg,jpeg,svg,mp3,ogg,m4a,wav}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const IMAGE_EXT = ['webp', 'png', 'jpg', 'jpeg', 'svg'];
const AUDIO_EXT = ['mp3', 'ogg', 'm4a', 'wav'];

/** URL of an asset by path without extension, e.g. `roles/mafia`. Null if the file is not there yet. */
export function asset(pathNoExt: string, kind: 'image' | 'audio' = 'image'): string | null {
  for (const ext of kind === 'image' ? IMAGE_EXT : AUDIO_EXT) {
    const url = files[`/src/assets/${pathNoExt}.${ext}`];
    if (url) return url;
  }
  return null;
}

export const roleArt = (role: Role | 'back') => asset(`roles/${role}`);
export const roleIcon = (role: Role) => asset(`icons/roles/${role}`);

export type StampKind = 'killed' | 'exiled' | 'alibi' | 'case-closed' | 'checked-mafia' | 'checked-clean' | 'no-answer';
export const stampImage = (kind: StampKind) => asset(`stamps/${kind}`);

/** Puts texture URLs into CSS variables; missing textures fall back to the CSS noise. */
export function applyTextures(): void {
  const root = document.documentElement.style;
  for (const name of ['paper', 'felt', 'cardboard']) {
    const url = asset(`textures/${name}`);
    root.setProperty(`--tex-${name}`, url ? `url("${url}")` : 'none');
  }
}

/** For the rules screen: which assets are in place. */
export const EXPECTED_ASSETS: { path: string; what: string }[] = [
  ...(['civilian', 'mafia', 'commissar', 'doctor', 'lover', 'maniac', 'back'] as const).map((r) => ({
    path: `roles/${r}`,
    what: 'Арт карты 1024×1536',
  })),
  { path: 'stamps/killed', what: 'Штамп «УБИТ»' },
  { path: 'stamps/exiled', what: 'Штамп «ИЗГНАН»' },
  { path: 'stamps/case-closed', what: 'Штамп «ДЕЛО ЗАКРЫТО»' },
  { path: 'textures/paper', what: 'Бумага, бесшовная' },
  { path: 'textures/felt', what: 'Сукно, бесшовное' },
];
