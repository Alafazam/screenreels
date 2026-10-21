import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { assemble } from '../lib/assemble.mjs';
import { DEFAULTS } from '../lib/config.mjs';
import { ffmpegPath, ffprobePath, probeDurationSeconds } from '../lib/media.mjs';
import { NARRATION_SIDECAR_SUFFIX } from '../lib/narration-track.mjs';

/* Real ffmpeg, no browser: a 2 s clip, a tone as the "narration file", and the sidecar Capture
   would write. The tone must start where the sidecar says, in the canonical audio shape. */
const ONSET_TOLERANCE_S = 0.06;

function fixture({ toneS = 0.5, offsetMs = 700, clipS = 2 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screenreel-narration-'));
  const clips = path.join(dir, 'clips'); fs.mkdirSync(clips);
  const ffmpeg = ffmpegPath();
  execFileSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', `color=c=black:s=128x72:r=10:d=${clipS}`, '-c:v', 'libx264', '-g', '1', '-pix_fmt', 'yuv420p', path.join(clips, 'scene.mp4')], { stdio: 'ignore' });
  const tone = path.join(dir, 'tone.mp3');
  execFileSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${toneS}`, '-ac', '1', tone], { stdio: 'ignore' });
  const durationMs = Math.round(probeDurationSeconds(tone) * 1000);
  fs.writeFileSync(path.join(clips, `scene${NARRATION_SIDECAR_SUFFIX}`), JSON.stringify({ sceneId: 'scene', steps: [{ card: 0, file: tone, durationMs, offsetMs }] }));
  const config = (overflow = 'extend') => ({
    ...DEFAULTS, fps: 10, videoSize: { w: 128, h: 72 },
    titleCards: { ...DEFAULTS.titleCards, open: null, perScene: false },
    out: { clips, video: path.join(dir, `reel-${overflow}.mp4`), tmp: path.join(dir, '.tmp') },
    // No usable TTS engine: a scene voiced from files must never need one.
    voice: { ...DEFAULTS.voice, enabled: true, provider: 'command', command: 'not-a-template', overflow },
  });
  const scenes = [{ id: 'scene', title: 'Scene', narration: '', actions: [{ type: 'callout', stepMs: 1000, narrationAudio: 'tone.mp3', narration: 'A tone.' }] }];
  return { config, scenes };
}

function audioShape(file) {
  return execFileSync(ffprobePath(), ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_name,sample_rate,channels', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim();
}
/* The first moment the track is not silent, from ffmpeg's silencedetect. */
function firstSoundSeconds(file) {
  const { stderr } = spawnSync(ffmpegPath(), ['-hide_banner', '-i', file, '-af', 'silencedetect=noise=-40dB:d=0.05', '-f', 'null', '-'], { encoding: 'utf8' });
  const end = stderr.match(/silence_end: ([\d.]+)/);
  assert.ok(end, 'the track has a silent lead-in followed by sound');
  return Number(end[1]);
}

test('a sidecar puts the narration file at its card time, in the canonical audio shape, without a TTS engine', async () => {
  const { config, scenes } = fixture();
  const video = await assemble(config(), scenes);
  assert.equal(audioShape(video), 'aac,48000,2');
  const onset = firstSoundSeconds(video);
  assert.ok(Math.abs(onset - 0.7) <= ONSET_TOLERANCE_S, `tone starts at ${onset}s, expected 0.7s`);
  assert.ok(Math.abs(probeDurationSeconds(video) - 2) <= 0.15, 'the video keeps the clip length');
});

test("overflow 'extend' holds the last frame until the narration ends; 'truncate' keeps the clip length", async () => {
  const { config, scenes } = fixture({ toneS: 1.5, offsetMs: 1200 });
  const extended = await assemble(config('extend'), scenes);
  assert.ok(probeDurationSeconds(extended) >= 2.6, `extended to ${probeDurationSeconds(extended)}s`);
  const cut = await assemble(config('truncate'), scenes);
  assert.ok(Math.abs(probeDurationSeconds(cut) - 2) <= 0.15, `truncated to ${probeDurationSeconds(cut)}s`);
});
