import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
execFileSync(process.execPath, [path.join(root, 'scripts/build.mjs')], { stdio: 'inherit' });
const release = path.join(root, 'release'); fs.rmSync(release, { recursive: true, force: true }); fs.mkdirSync(release, { recursive: true });
const name = `screenreel-browser-v${pkg.version}.tar.gz`; const archive = path.join(release, name);
execFileSync('tar', ['-czf', archive, '-C', path.join(root, 'dist'), 'projector']);
const digest = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
fs.writeFileSync(path.join(release, 'SHA256SUMS'), `${digest}  ${name}\n`);
console.log(`Prepared ${archive}`);
