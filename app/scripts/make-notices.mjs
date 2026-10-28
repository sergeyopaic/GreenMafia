// Bundle installed runtime license texts for offline display. Regenerate after dependency changes.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = dirname(app);
const target = join(app, 'src/assets/licenses/third-party.json');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const normalized = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n').trim();
const packages = new Map();

function visit(name, from = app) {
  if (name.startsWith('@greenmafia/')) return;
  let folder;
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) { folder = candidate; break; }
    if (dirname(dir) === dir) throw new Error(`Cannot locate ${name}`);
  }
  const pkg = readJson(join(folder, 'package.json'));
  const key = `${pkg.name}@${pkg.version}`;
  if (packages.has(key)) return;
  const texts = readdirSync(folder).filter((file) => /^(licen[cs]e|notice)(\.|$)/i.test(file))
    .sort().map((file) => normalized(join(folder, file)));
  if (!texts.length || !pkg.license) throw new Error(`Missing license for ${key}`);
  // idb-keyval distributes its attribution and an Apache URL, so include the full terms too.
  if (pkg.license === 'Apache-2.0' && !texts.some((text) => text.includes('TERMS AND CONDITIONS FOR USE'))) {
    const apache = normalized(join(root, 'node_modules/typescript/LICENSE.txt'));
    if (!apache.startsWith('Apache License') || !apache.endsWith('END OF TERMS AND CONDITIONS')) throw new Error('Unexpected Apache terms');
    texts.push(apache);
  }
  packages.set(key, { name: pkg.name, version: pkg.version, license: pkg.license, text: texts.join('\n\n') });
  for (const dep of Object.keys(pkg.dependencies ?? {})) visit(dep, folder);
}

for (const name of Object.keys(readJson(join(app, 'package.json')).dependencies)) visit(name);
// The generated service worker and registration helper are shipped by vite-plugin-pwa.
for (const name of ['workbox-window', 'workbox-precaching']) visit(name);
const result = JSON.stringify([...packages.values()].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0), null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (!existsSync(target) || normalized(target) !== result.trim()) throw new Error('License notices are stale. Run npm run notices --workspace app.');
} else {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, result);
}
