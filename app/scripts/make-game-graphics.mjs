// Native SVG artwork complements the existing vector icon and CSS design system.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const out = fileURLToPath(new URL('../src/assets/', import.meta.url));
const brand = fileURLToPath(new URL('../public/assets/brand/', import.meta.url));
const fontFile = (subset) => readFileSync(new URL(`../../node_modules/@fontsource/rubik-dirt/files/rubik-dirt-${subset}-400-normal.woff2`, import.meta.url)).toString('base64');
const stamps = {
  killed: ['УБИТ', '#b3261e'], exiled: ['ИЗГНАН', '#b3261e'], 'case-closed': ['ДЕЛО ЗАКРЫТО', '#b3261e'],
  alibi: ['АЛИБИ', '#1d5a40'], 'checked-mafia': ['МАФИЯ', '#b3261e'], 'checked-clean': ['НЕ МАФИЯ', '#1d5a40'], 'no-answer': ['НЕТ ОТВЕТА', '#1d5a40'],
  'checked-commissar': ['КОМИССАР', '#b3261e'], 'checked-not-commissar': ['НЕ КОМИССАР', '#1d5a40'],
};
// Stamps carry text, so each language gets its own set: stamps/<kind>.svg (Russian) and stamps/en/<kind>.svg.
const english = {
  killed: 'KILLED', exiled: 'EXILED', 'case-closed': 'CASE CLOSED', alibi: 'ALIBI', 'checked-mafia': 'MAFIA', 'checked-clean': 'NOT MAFIA',
  'no-answer': 'NO ANSWER', 'checked-commissar': 'COMMISSAR', 'checked-not-commissar': 'NOT COMMISSAR',
};
const sets = [
  { dir: `${out}/stamps`, font: fontFile('cyrillic'), text: (name) => stamps[name][0] },
  { dir: `${out}/stamps/en`, font: fontFile('latin'), text: (name) => english[name] },
];
for (const set of sets) {
  mkdirSync(set.dir, { recursive: true });
  for (const [name, [, color]] of Object.entries(stamps)) {
    const text = set.text(name);
    const size = text.length > 12 ? 96 : text.length > 9 ? 104 : text.length > 6 ? 140 : 180;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 512"><style>@font-face{font-family:Stamp;src:url(data:font/woff2;base64,${set.font})}</style><g fill="none" stroke="${color}"><rect x="22" y="90" width="980" height="332" rx="10" stroke-width="14"/><rect x="42" y="110" width="940" height="292" rx="3" stroke-width="4"/></g><text x="512" y="278" dominant-baseline="middle" text-anchor="middle" font-family="Stamp,Georgia,serif" font-size="${size}" fill="${color}">${text}</text></svg>`;
    writeFileSync(`${set.dir}/${name}.svg`, svg);
  }
}
mkdirSync(`${out}/roles`, { recursive: true });
writeFileSync(`${out}/roles/back.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1536"><defs><pattern id="p" width="48" height="48" patternUnits="userSpaceOnUse"><path d="m24 0 24 24-24 24L0 24Z" fill="none" stroke="#b4894a" stroke-opacity=".2"/></pattern></defs><path fill="#0f2e21" d="M0 0h1024v1536H0z"/><path fill="url(#p)" d="M0 0h1024v1536H0z"/><g fill="none" stroke="#b4894a"><rect x="40" y="40" width="944" height="1456" rx="22" stroke-width="5"/><rect x="60" y="60" width="904" height="1416" rx="12" stroke-width="2"/><circle cx="512" cy="768" r="230" stroke-width="6"/><circle cx="512" cy="768" r="205" stroke-width="2"/></g><path fill="#eee4cd" d="M370 900V650h48l94 125 94-125h48v250h-55V742l-87 112-87-112v158z"/></svg>`);
const mark = `<g fill="none" stroke="#b4894a" stroke-width="7"><circle cx="128" cy="128" r="111"/><circle cx="128" cy="128" r="98" stroke-width="2"/></g><path fill="#eee4cd" d="M65 183V77h22l41 55 41-55h22v106h-25v-65l-38 49-38-49v65z"/><path fill="#b9d94a" d="m128 35 5 11-5 11-5-11z"/>`;
mkdirSync(brand, { recursive: true });
writeFileSync(`${brand}/logo.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="GreenMafia">${mark}</svg>`);
console.log(`Generated ${Object.keys(stamps).length} stamps in ${sets.length} languages, a card back and the brand emblem.`);
