import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'packages/core/audio-narrator.js'), 'utf8');

/* A stand-in for HTMLAudioElement: records what the narrator asks of it, and lets a test end the
   file or make play() refuse the way a browser's autoplay policy does. */
function loadAudioNarrator({ refuse = null } = {}) {
  const created = [];
  class FakeAudio {
    constructor(src) { this.src = src; this.paused = true; this.currentTime = 0; this.listeners = {}; this.plays = 0; created.push(this); }
    addEventListener(type, fn) { (this.listeners[type] ||= new Set()).add(fn); }
    removeEventListener(type, fn) { this.listeners[type]?.delete(fn); }
    removeAttribute(name) { if (name === 'src') this.src = ''; }
    play() {
      this.plays += 1;
      if (refuse) { const error = new Error('refused'); error.name = refuse; return Promise.reject(error); }
      this.paused = false; return Promise.resolve();
    }
    pause() { this.paused = true; }
    end() { this.paused = true; this.listeners.ended?.forEach((fn) => fn()); }
  }
  const window = { Audio: FakeAudio };
  new Function('window', source)(window);
  return { narrator: window.__screenreelAudioNarrator, created };
}

test('plays the file from the start and reports that it played', async () => {
  const { narrator, created } = loadAudioNarrator();
  const result = await narrator.play(' /guides/audio/step-1.mp3 ');
  assert.deepEqual(result, { played: true, reason: null });
  assert.equal(created.length, 1);
  assert.equal(created[0].src, '/guides/audio/step-1.mp3');
  assert.equal(created[0].currentTime, 0);
  assert.equal(narrator.playing(), true);
  assert.equal(narrator.url(), '/guides/audio/step-1.mp3');
});

test('an offset starts the file part-way, so unmuting mid-step lands on the clock', async () => {
  const { narrator, created } = loadAudioNarrator();
  await narrator.play('step.mp3', { offsetMs: 2350 });
  assert.equal(created[0].currentTime, 2.35);
});

test('settle resolves when the file ends, and at once when nothing plays', async () => {
  const { narrator, created } = loadAudioNarrator();
  await narrator.settle(); // silent: must not hang
  await narrator.play('step.mp3');
  let settled = false; const done = narrator.settle().then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  created[0].end();
  await done;
  assert.equal(narrator.playing(), false);
});

test('mute (stop) silences the file at once and releases a pending settle', async () => {
  const { narrator, created } = loadAudioNarrator();
  await narrator.play('step.mp3');
  const done = narrator.settle();
  narrator.stop();
  await done; // would time out the test if stop did not resolve it
  assert.equal(created[0].paused, true);
  assert.equal(created[0].src, '', 'the element lets go of the file');
  assert.equal(narrator.playing(), false);
});

test('cancel is stop, and a new file replaces the one playing', async () => {
  const { narrator, created } = loadAudioNarrator();
  await narrator.play('one.mp3');
  await narrator.play('two.mp3');
  assert.equal(created[0].paused, true, 'the first file stopped');
  assert.equal(narrator.url(), 'two.mp3');
  narrator.cancel();
  assert.equal(narrator.playing(), false);
  assert.equal(created[1].paused, true);
});

test('pause keeps the file loaded and resume continues it', async () => {
  const { narrator, created } = loadAudioNarrator();
  await narrator.play('step.mp3');
  narrator.pause();
  assert.equal(created[0].paused, true);
  assert.equal(narrator.playing(), true, 'paused is not ended');
  narrator.resume();
  assert.equal(created[0].paused, false);
  assert.equal(created[0].plays, 2);
});

test('the autoplay policy refusing is reported as blocked, not thrown', async () => {
  const { narrator } = loadAudioNarrator({ refuse: 'NotAllowedError' });
  const result = await narrator.play('step.mp3');
  assert.equal(result.played, false);
  assert.equal(result.reason, 'blocked');
  assert.equal(narrator.playing(), false);
});

test('a file that fails to load is reported as an error', async () => {
  const { narrator } = loadAudioNarrator({ refuse: 'NotSupportedError' });
  assert.equal((await narrator.play('missing.mp3')).reason, 'error');
});

test('an empty url is silent and no Audio is the same as unsupported', async () => {
  const { narrator, created } = loadAudioNarrator();
  assert.deepEqual(await narrator.play('  '), { played: false, reason: 'empty' });
  assert.equal(created.length, 0);
  const window = {};
  new Function('window', source)(window);
  assert.equal(window.__screenreelAudioNarrator.available(), false);
  assert.deepEqual(await window.__screenreelAudioNarrator.play('step.mp3'), { played: false, reason: 'unsupported' });
  window.__screenreelAudioNarrator.stop(); // safe with nothing playing
});
