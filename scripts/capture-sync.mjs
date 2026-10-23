#!/usr/bin/env node
/* End-to-end check that a captured, voiced video keeps the live tour's timing (docs/voiceover.md,
   "Narration files in the captured video"). Real Chrome, real ffmpeg, no app server needed:

   - a fixture page with one timed card (stepMs 2500) whose narration file is 0.5 s of silence and
     then a 440 Hz tone, and a `call` action at atMs 1500 that turns the page red;
   - Capture records it and assemble adds the voice;
   - the MP4 is measured: the tone must start at the card time + 0.5 s, and the first red frame
     must be at the card time + 1.5 s, both within SYNC_TOLERANCE_MS. The audio is one AAC 48 kHz
     stereo stream.

   Runs in `pnpm test:browser`, so CI checks it on every pull request. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { capture } from '../lib/capture.mjs';
import { assemble } from '../lib/assemble.mjs';
import { DEFAULTS } from '../lib/config.mjs';
import { ffmpegPath, ffprobePath } from '../lib/media.mjs';
import { NARRATION_SIDECAR_SUFFIX } from '../lib/narration-track.mjs';

const SYNC_TOLERANCE_MS = 120;
const TONE_LEAD_MS = 500;
const RED_AT_MS = 1500;
const STEP_MS = 2500;
const FPS = 30;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screenreel-capture-sync-'));
const site = path.join(dir, 'site'); fs.mkdirSync(site);
// A still page sends no screencast frames, so a small dot moves all the time, as in a real app.
fs.writeFileSync(path.join(site, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><title>sync</title>
<style>html,body{margin:0;height:100%;background:#ffffff}#box{margin:120px auto;width:200px;padding:20px;border:2px solid #333;font:16px sans-serif}#tick{position:fixed;left:8px;bottom:8px;width:6px;height:6px;background:#333;animation:tick .2s steps(2) infinite}@keyframes tick{50%{transform:translateX(6px)}}</style>
<script>window.turnRed = () => { document.documentElement.style.background = '#ff0000'; document.body.style.background = '#ff0000'; };</script>
</head><body><div id="box">Card target</div><div id="tick"></div></body></html>`);
const ffmpeg = ffmpegPath();
execFileSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', `sine=frequency=440:duration=1,adelay=${TONE_LEAD_MS}:all=1`, '-ac', '1', '-b:a', '128k', path.join(site, 'tone.mp3')], { stdio: 'ignore' });

const types = { '.html': 'text/html', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  const file = path.join(site, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(site) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}/`;

try {
  const config = {
    ...DEFAULTS, baseUrl, fps: FPS,
    viewport: { width: 640, height: 360 }, deviceScaleFactor: 1, videoSize: { w: 640, h: 360 },
    titleCards: { ...DEFAULTS.titleCards, open: null, perScene: false },
    out: { clips: path.join(dir, 'clips'), video: path.join(dir, 'sync.mp4'), tmp: path.join(dir, '.tmp') },
    voice: { ...DEFAULTS.voice, enabled: true, provider: 'command', command: 'unused-because-the-scene-has-files' },
  };
  const scenes = [{
    id: 'sync', route: 'index.html', settleMs: 200, leadInMs: 400, tailMs: 600, endsInNavigation: false, narration: '',
    actions: [
      { type: 'callout', selector: '#box', title: 'Sync', text: 'A timed card.', stepMs: STEP_MS, narrationAudio: 'tone.mp3', narration: 'A tone.' },
      { type: 'call', fn: 'turnRed', atMs: RED_AT_MS },
    ],
  }];
  const { failed } = await capture(config, scenes);
  assert.equal(failed, 0, 'the scene captures');
  const { steps } = JSON.parse(fs.readFileSync(path.join(config.out.clips, `sync${NARRATION_SIDECAR_SUFFIX}`), 'utf8'));
  assert.equal(steps.length, 1, 'the card reports when it shows');
  const cardMs = steps[0].offsetMs;
  const video = await assemble(config, scenes);

  const shape = execFileSync(ffprobePath(), ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_name,sample_rate,channels', '-of', 'csv=p=0', video], { encoding: 'utf8' }).trim();
  assert.equal(shape, 'aac,48000,2', 'one AAC 48 kHz stereo stream');

  const { stderr } = spawnSync(ffmpeg, ['-hide_banner', '-i', video, '-af', 'silencedetect=noise=-40dB:d=0.1', '-f', 'null', '-'], { encoding: 'utf8' });
  const toneMs = Number(stderr.match(/silence_end: ([\d.]+)/)?.[1]) * 1000;
  assert.ok(Number.isFinite(toneMs), 'the video has a silent lead-in and then the tone');

  const raw = execFileSync(ffmpeg, ['-v', 'error', '-i', video, '-vf', `fps=${FPS},scale=4:4`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 });
  const frameBytes = 4 * 4 * 3; const centre = (2 * 4 + 2) * 3;
  let redFrame = -1;
  for (let frame = 0; frame * frameBytes < raw.length; frame += 1) {
    const [r, g, b] = raw.subarray(frame * frameBytes + centre, frame * frameBytes + centre + 3);
    if (r > 200 && g < 80 && b < 80) { redFrame = frame; break; }
  }
  assert.ok(redFrame >= 0, 'the page turns red during the take');
  const redMs = (redFrame / FPS) * 1000;

  const report = { cardMs, toneMs: Math.round(toneMs), expectedToneMs: cardMs + TONE_LEAD_MS, redMs: Math.round(redMs), expectedRedMs: cardMs + RED_AT_MS };
  console.log('[capture-sync]', JSON.stringify(report));
  assert.ok(Math.abs(toneMs - report.expectedToneMs) <= SYNC_TOLERANCE_MS, `the voice starts at ${report.toneMs} ms, expected ${report.expectedToneMs} ms`);
  assert.ok(Math.abs(redMs - report.expectedRedMs) <= SYNC_TOLERANCE_MS, `the action lands at ${report.redMs} ms, expected ${report.expectedRedMs} ms`);
  console.log('[capture-sync] voice and action are in sync');
} finally {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
