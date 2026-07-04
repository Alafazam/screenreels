#!/usr/bin/env node
// screenreel CLI — record scripted user journeys of a running web app into a
// stitched demo video.
//
//   screenreel init                      scaffold screenreel.config.mjs + scenes file
//   screenreel capture [ids…]            capture scenes (all by default) into clips
//   screenreel assemble                  stitch existing clips + title cards into the video
//   screenreel record [ids…]             capture + assemble in one go
//
//   --config <path>                      config file (default ./screenreel.config.mjs)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadConfig, loadScenes } from '../lib/config.mjs';
import { capture } from '../lib/capture.mjs';
import { assemble } from '../lib/assemble.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const command = argv[0];

function opt(name, fallback) {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
}
const positional = argv.slice(1).filter((a, i, arr) => !a.startsWith('--') && arr[i - 1] !== '--config');

const HELP = `screenreel — scripted user journeys of a running web app → demo video

Usage:
  screenreel init [--config <path>]        scaffold config + scenes templates
  screenreel capture [ids…] [--config …]   capture scenes as clips
  screenreel assemble [--config …]         stitch clips + title cards into the video
  screenreel record [ids…] [--config …]    capture + assemble

The app under capture must already be running (dev server); set baseUrl,
login hook and output paths in screenreel.config.mjs.`;

async function main() {
  if (!command || command === '--help' || command === '-h') { console.log(HELP); return; }

  if (command === 'init') {
    const configDest = path.resolve(opt('--config', './screenreel.config.mjs'));
    const scenesDest = path.join(path.dirname(configDest), 'screenreel.scenes.json');
    for (const [src, dest] of [
      [path.join(__dirname, '../templates/screenreel.config.mjs'), configDest],
      [path.join(__dirname, '../templates/screenreel.scenes.json'), scenesDest],
    ]) {
      if (fs.existsSync(dest)) { console.log(`exists, skipped: ${dest}`); continue; }
      fs.copyFileSync(src, dest);
      console.log(`created: ${dest}`);
    }
    console.log('\nNext: edit both files, start your dev server, then run "screenreel record".');
    return;
  }

  const config = await loadConfig(opt('--config', './screenreel.config.mjs'));
  const allScenes = loadScenes(config);
  const scenes = positional.length
    ? positional.map(id => {
        const s = allScenes.find(x => x.id === id);
        if (!s) throw new Error(`unknown scene "${id}" (have: ${allScenes.map(x => x.id).join(', ')})`);
        return s;
      })
    : allScenes;

  if (command === 'capture' || command === 'record') {
    const { failed } = await capture(config, scenes);
    if (failed) {
      console.error(`\n${failed} scene(s) failed — fix and re-capture before stitching`);
      process.exit(1);
    }
  }
  if (command === 'assemble' || command === 'record') {
    // Assemble always walks the FULL scene list so a partial re-capture still
    // stitches the complete reel from existing clips.
    assemble(config, allScenes);
  }
  if (!['capture', 'assemble', 'record'].includes(command)) {
    console.error(`unknown command: ${command}\n\n${HELP}`);
    process.exit(1);
  }
}

main().catch(err => { console.error(err.message || err); process.exit(1); });
