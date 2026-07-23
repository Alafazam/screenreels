import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.join(root, '_site');
const example = path.join(root, 'examples/action-showcase');

const build = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: root, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

fs.rmSync(site, { recursive: true, force: true });
fs.mkdirSync(site, { recursive: true });
for (const name of ['index.html', 'destination.html', 'styles.css', 'app.js', 'screenreel.demo.json']) {
  fs.copyFileSync(path.join(example, name), path.join(site, name));
}
fs.cpSync(path.join(root, 'dist/projector'), path.join(site, 'dist/projector'), { recursive: true });

for (const name of ['index.html', 'destination.html']) {
  const target = path.join(site, name);
  const html = fs.readFileSync(target, 'utf8').replaceAll('../../dist/projector/', './dist/projector/');
  fs.writeFileSync(target, html);
}
fs.writeFileSync(path.join(site, '.nojekyll'), '');

const required = [
  'index.html',
  'destination.html',
  'styles.css',
  'app.js',
  'screenreel.demo.json',
  'dist/projector/screenreel.js',
  'dist/projector/projector.js',
  'dist/projector/screenreel.css',
  '.nojekyll',
];
for (const name of required) {
  if (!fs.existsSync(path.join(site, name))) throw new Error(`Pages artifact is missing ${name}`);
}
const stagedText = ['index.html', 'destination.html', 'screenreel.demo.json']
  .map((name) => fs.readFileSync(path.join(site, name), 'utf8'))
  .join('\n');
if (stagedText.includes('../../dist/projector/')) throw new Error('Pages artifact contains a broken projector asset path');
if (stagedText.includes('/examples/action-showcase')) throw new Error('Pages artifact contains an old absolute example route');
if (fs.existsSync(path.join(site, 'CNAME'))) throw new Error('Pages artifact must not claim the user-site custom domain');

console.log(`Built GitHub Pages artifact with ${required.length} validated entries in ${site}`);
