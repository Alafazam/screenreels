// Screenreel assembly: title cards + concat into the final review video.
// Everything is normalized to the same codec params (libx264, yuv420p, CFR)
// before the concat demuxer stitches it, then one clean re-encode produces a
// small, seekable, faststart MP4.

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveFont } from './config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ffmpegPath = () =>
  execFileSync('node', ['-p', "require('@ffmpeg-installer/ffmpeg').path"], { cwd: __dirname }).toString().trim();

export function assemble(config, scenes) {
  const ffmpeg = ffmpegPath();
  const font = resolveFont(config);
  const cardsDir = path.join(config.out.tmp, 'cards');
  fs.mkdirSync(cardsDir, { recursive: true });

  const tc = config.titleCards;
  const parts = [];

  if (tc.open) parts.push(titleCard('open', tc.open.title, tc.open.sub || '', tc.openDurS, config, font, cardsDir, ffmpeg));

  let missing = 0;
  for (const scene of scenes) {
    const clip = path.join(config.out.clips, `${scene.id}.mp4`);
    if (!fs.existsSync(clip)) { console.warn(`[stitch] missing ${scene.id}.mp4 — skipped`); missing++; continue; }
    if (tc.perScene && scene.title) {
      parts.push(titleCard(scene.id, scene.title, scene.sub || '', tc.durS, config, font, cardsDir, ffmpeg));
    }
    parts.push(clip);
  }
  if (!parts.length) throw new Error('nothing to stitch — capture some scenes first');

  const listFile = path.join(config.out.tmp, 'final-list.txt');
  fs.writeFileSync(listFile, parts.map(p => `file '${p}'`).join('\n') + '\n');
  fs.mkdirSync(path.dirname(config.out.video), { recursive: true });
  execFileSync(ffmpeg, [
    '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', config.out.video,
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  console.log(`\nfinal video → ${config.out.video}${missing ? `  (${missing} scene(s) missing)` : ''}`);
  return config.out.video;
}

function titleCard(id, title, sub, durS, config, font, cardsDir, ffmpeg) {
  // textfile= sidesteps drawtext's escaping rules for arbitrary titles.
  const tTxt = path.join(cardsDir, `${id}-t.txt`);
  const sTxt = path.join(cardsDir, `${id}-s.txt`);
  fs.writeFileSync(tTxt, title);
  fs.writeFileSync(sTxt, sub);
  const { w, h } = config.videoSize;
  const tc = config.titleCards;
  const out = path.join(cardsDir, `${id}.mp4`);
  const draw = (txt, size, color, y) =>
    `drawtext=fontfile=${font}:textfile=${txt}:fontsize=${size}:fontcolor=${color}:x=(w-text_w)/2:y=${y}`;
  const scale = h / 1080; // keep card typography proportional at any output size
  execFileSync(ffmpeg, [
    '-y', '-f', 'lavfi', '-i', `color=c=${tc.bg}:s=${w}x${h}:r=${config.fps}:d=${durS}`,
    '-vf', `${draw(tTxt, Math.round(64 * scale), tc.titleColor, '(h/2)-70')},${draw(sTxt, Math.round(34 * scale), tc.subColor, '(h/2)+30')}`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-g', '1',
    '-pix_fmt', 'yuv420p', out,
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  return out;
}
