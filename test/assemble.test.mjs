import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { assemble } from '../lib/assemble.mjs';
import { ffmpegPath, countAudioStreams, probeDurationSeconds } from '../lib/media.mjs';
import { DEFAULTS } from '../lib/config.mjs';

/* A minimal real pipeline: two 1s lavfi clips assembled with and without voice. Runs on CI —
   the "TTS engine" is a stub command provider that copies a pre-generated silent m4a. */
function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screenreel-assemble-'));
  const clips = path.join(dir, 'clips'); fs.mkdirSync(clips);
  const ffmpeg = ffmpegPath();
  for (const id of ['one', 'two']) {
    execFileSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'color=c=black:s=128x72:r=10:d=1', '-c:v', 'libx264', '-g', '1', '-pix_fmt', 'yuv420p', path.join(clips, `${id}.mp4`)], { stdio: 'ignore' });
  }
  const narration = path.join(dir, 'stub-narration.m4a');
  execFileSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '0.6', '-c:a', 'aac', narration], { stdio: 'ignore' });
  const config = (voice) => ({
    ...DEFAULTS,
    fps: 10,
    videoSize: { w: 128, h: 72 },
    titleCards: { ...DEFAULTS.titleCards, open: null, perScene: false },
    out: { clips, video: path.join(dir, voice ? 'reel-voiced.mp4' : 'reel.mp4'), tmp: path.join(dir, '.tmp') },
    voice: { ...DEFAULTS.voice, enabled: voice, provider: 'command', command: `node -e "require('node:fs').copyFileSync('${narration}', process.argv[1])" {outFile} -- {textFile}` },
  });
  const scenes = [
    { id: 'one', title: 'One', talkingPoints: 'The first scene speaks.' },
    { id: 'two', title: 'Two', talkingPoints: '' },
  ];
  return { dir, config, scenes };
}

test('assemble without voice produces a video with zero audio streams (regression lock)', async () => {
  const { dir, config, scenes } = makeFixture();
  const video = await assemble(config(false), scenes);
  assert(fs.existsSync(video));
  assert.equal(countAudioStreams(video), 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('assemble with voice produces exactly one audio stream and keeps full duration', async () => {
  const { dir, config, scenes } = makeFixture();
  const video = await assemble(config(true), scenes);
  assert.equal(countAudioStreams(video), 1);
  const seconds = probeDurationSeconds(video);
  assert(seconds > 1.8 && seconds < 2.6, `expected ~2s of stitched clips, got ${seconds}`);
  fs.rmSync(dir, { recursive: true, force: true });
});
