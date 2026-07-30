import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createVoiceProvider, narrationText, AUDIO_SAMPLE_RATE, AUDIO_CHANNELS } from '../lib/voice.mjs';
import { ffmpegPath, ffprobePath, probeDurationSeconds, countAudioStreams } from '../lib/media.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'screenreel-voice-'));

test('narration text prefers explicit narration over talkingPoints and trims to null', () => {
  assert.equal(narrationText({ narration: 'Say this', talkingPoints: 'Not this' }), 'Say this');
  assert.equal(narrationText({ talkingPoints: 'Fallback' }), 'Fallback');
  assert.equal(narrationText({ talkingPoints: '   ' }), null);
  assert.equal(narrationText({}), null);
});

test('provider selection: say default, command, custom object, unknown rejected', () => {
  assert.equal(createVoiceProvider({}).name, 'say');
  assert.equal(createVoiceProvider({ provider: 'say' }).name, 'say');
  assert.equal(createVoiceProvider({ provider: 'command', command: 'x {outFile}' }).name, 'command');
  const custom = createVoiceProvider({ provider: { name: 'mine', synthesize: async () => {} } });
  assert.equal(custom.name, 'mine');
  assert.equal(custom.available().ok, true);
  assert.throws(() => createVoiceProvider({ provider: 'clippy' }), /unknown voice.provider/);
  assert.throws(() => createVoiceProvider({ provider: {} }), /synthesize/);
});

test('say provider availability reflects the platform; command requires placeholders', () => {
  const say = createVoiceProvider({ provider: 'say' });
  assert.equal(say.available().ok, process.platform === 'darwin');
  assert.equal(createVoiceProvider({ provider: 'command' }).available().ok, false);
  assert.equal(createVoiceProvider({ provider: 'command', command: 'no placeholders' }).available().ok, false);
  assert.equal(createVoiceProvider({ provider: 'command', command: 'tts {textFile} -o {outFile}' }).available().ok, true);
});

test('command provider substitutes placeholders and transcodes to canonical AAC', async () => {
  const dir = tmp();
  const source = path.join(dir, 'source.wav');
  // A half-second of silence as the "TTS engine" output.
  execFileSync(ffmpegPath(), ['-y', '-f', 'lavfi', '-i', `anullsrc=r=${AUDIO_SAMPLE_RATE}:cl=stereo`, '-t', '0.5', source], { stdio: 'ignore' });
  const provider = createVoiceProvider({ provider: 'command', command: `node -e "require('node:fs').copyFileSync('${source}', process.argv[1])" {outFile} && node -e "process.exit(require('node:fs').existsSync(process.argv[1]) ? 0 : 1)" {textFile}` });
  const out = path.join(dir, 'narration.m4a');
  await provider.synthesize('hello world', out);
  assert(fs.existsSync(out));
  const info = execFileSync(ffprobePath(), ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name,sample_rate,channels', '-of', 'csv=p=0', out]).toString().trim();
  assert.equal(info, `aac,${AUDIO_SAMPLE_RATE},${AUDIO_CHANNELS}`);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('say provider synthesizes real speech on macOS', { skip: process.platform !== 'darwin' }, async () => {
  const dir = tmp();
  const out = path.join(dir, 'say.m4a');
  await createVoiceProvider({ provider: 'say' }).synthesize('ScreenReel voice test', out);
  assert(probeDurationSeconds(out) > 0.2);
  assert.equal(countAudioStreams(out), 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('probeDurationSeconds reads a real duration and fails loudly otherwise', () => {
  const dir = tmp();
  const clip = path.join(dir, 'clip.mp4');
  execFileSync(ffmpegPath(), ['-y', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:r=10:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', clip], { stdio: 'ignore' });
  const seconds = probeDurationSeconds(clip);
  assert(seconds > 0.9 && seconds < 1.2, `expected ~1s, got ${seconds}`);
  assert.equal(countAudioStreams(clip), 0);
  fs.rmSync(dir, { recursive: true, force: true });
});
