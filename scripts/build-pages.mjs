import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.join(root, '_site');
const example = path.join(root, 'examples/action-showcase');

/* Cache keys are derived from file contents, not the release version. Keying on the version meant
   any edit shipped without a version bump kept its old `?v=` URL, so the CDN went on serving the
   previous file indefinitely. A content hash changes whenever the bytes change. */
const CACHE_KEY_LENGTH = 10;
const hashOf = (...buffers) => crypto.createHash('sha256').update(Buffer.concat(buffers)).digest('hex').slice(0, CACHE_KEY_LENGTH);
const hashFile = (file) => hashOf(fs.readFileSync(file));

const build = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: root, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

fs.rmSync(site, { recursive: true, force: true });
fs.mkdirSync(site, { recursive: true });
for (const name of ['index.html', 'destination.html', 'styles.css', 'app.js', 'fixtures.js', 'screenreel.demo.json', 'logo.svg', 'favicon.svg', 'apple-touch-icon.png', 'og-image.png', 'studio-shot.png', 'robots.txt', 'sitemap.xml']) {
  fs.copyFileSync(path.join(example, name), path.join(site, name));
}
fs.cpSync(path.join(root, 'dist/projector'), path.join(site, 'dist/projector'), { recursive: true });

/* The loader copies its own query onto every runtime asset it pulls in, so the runtime key must
   cover the whole directory — hashing screenreel.js alone would not bust action-runtime.js or
   cursor.js when only those change. */
const runtimeDir = path.join(site, 'dist/projector');
const runtimeKey = hashOf(...fs.readdirSync(runtimeDir).sort().map((name) => fs.readFileSync(path.join(runtimeDir, name))));
const pageKeys = { 'app.js': hashFile(path.join(site, 'app.js')), 'fixtures.js': hashFile(path.join(site, 'fixtures.js')) };

for (const name of ['index.html', 'destination.html']) {
  const target = path.join(site, name);
  let html = fs.readFileSync(target, 'utf8')
    .replaceAll('../../dist/projector/', './dist/projector/')
    .replaceAll('src="./dist/projector/screenreel.js"', `src="./dist/projector/screenreel.js?v=${runtimeKey}"`);
  for (const [asset, key] of Object.entries(pageKeys)) html = html.replaceAll(`src="${asset}"`, `src="${asset}?v=${key}"`);
  fs.writeFileSync(target, html);
}
fs.writeFileSync(path.join(site, '.nojekyll'), '');

const required = [
  'index.html',
  'destination.html',
  'styles.css',
  'app.js',
  'fixtures.js',
  'screenreel.demo.json',
  'logo.svg',
  'favicon.svg',
  'og-image.png',
  'apple-touch-icon.png',
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
if (!stagedText.includes('data-cfasync="false"')) throw new Error('Pages scripts must opt out of Cloudflare Rocket Loader');
// Every cache-busted asset must carry its content key, or the CDN will serve a stale copy.
for (const [asset, key] of [['./dist/projector/screenreel.js', runtimeKey], ...Object.entries(pageKeys)]) {
  if (!stagedText.includes(`src="${asset}?v=${key}"`)) throw new Error(`Pages artifact is missing the content cache key for ${asset}`);
}
if (/\?v=\d+\.\d+\.\d+"/.test(stagedText)) throw new Error('Pages artifact still uses release-version cache keys, which go stale without a version bump');
if (fs.existsSync(path.join(site, 'CNAME'))) throw new Error('Pages artifact must not claim the user-site custom domain');

console.log(`Built GitHub Pages artifact with ${required.length} validated entries in ${site}`);
