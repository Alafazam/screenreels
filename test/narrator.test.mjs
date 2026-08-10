import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import '../packages/core/action-runtime.js';
import { narrationText } from '../lib/voice.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { narrationScript } = globalThis.ScreenReelCore;

/* The whole point of the shared field: a scene must be spoken with the same words whether it is
   narrated live in a browser or rendered into an MP4 by ffmpeg. Two implementations are
   unavoidable (no ffmpeg in a browser, no speechSynthesis in Node), so pin them against each
   other — this is the test that fails if someone changes one side's precedence.

   The two use different empty sentinels ('' here, null in lib/voice.mjs) because each suits its
   caller: the browser concatenates the string, the CLI checks for a missing script. Both are
   falsy, so only the words are the shared contract. */
test('live narration and captured voiceover choose the same words for every scene shape', () => {
  const scenes = [
    { id: 'both', narration: 'Spoken version.', talkingPoints: 'Written version.' },
    { id: 'points-only', talkingPoints: 'Written version.' },
    { id: 'narration-only', narration: 'Spoken version.' },
    { id: 'empty-narration-is-silent', narration: '', talkingPoints: 'Written version.' },
    { id: 'whitespace', talkingPoints: '   ' },
    { id: 'neither' },
    { id: 'padded', talkingPoints: '  Trim me.  ' },
  ];
  for (const scene of scenes) {
    assert.equal(narrationScript(scene), narrationText(scene) ?? '', `diverged on scene "${scene.id}"`);
  }
});

/* `??` falls back on null/undefined but not on '', so an author who deliberately blanks narration
   silences the scene rather than reverting to the presenter notes. Subtle, and easy to "fix" into
   a regression on either side, so pin it on both. */
test('a deliberately blanked narration silences the scene instead of falling back to talkingPoints', () => {
  const scene = { narration: '', talkingPoints: 'Do not speak this.' };
  assert.equal(narrationScript(scene), '');
  assert.equal(narrationText(scene), null);
});

test('narrationScript prefers explicit narration, trims, and treats blank as silent', () => {
  assert.equal(narrationScript({ narration: 'A', talkingPoints: 'B' }), 'A');
  assert.equal(narrationScript({ talkingPoints: '  B  ' }), 'B');
  assert.equal(narrationScript({ talkingPoints: '   ' }), '');
  assert.equal(narrationScript({}), '');
  assert.equal(narrationScript(null), '');
});

/* The narrator is a browser module, so exercise it against a minimal speechSynthesis fake. This
   is the contract the projector depends on: speak() reports whether the engine actually started,
   settle() is bounded, and cancel() never leaves a caller awaiting forever. */
function loadNarrator({ voices = [{ name: 'Test', lang: 'en-US', localService: true }], autoStart = true, autoEnd = true } = {}) {
  const spoken = [];
  const listeners = new Map();
  const window = {
    document: { documentElement: { lang: 'en' } },
    SpeechSynthesisUtterance: class {
      constructor(text) { this.text = text; this.handlers = {}; }
      addEventListener(type, fn) { this.handlers[type] = fn; }
    },
    speechSynthesis: {
      getVoices: () => voices,
      addEventListener: (type, fn) => listeners.set(type, fn),
      removeEventListener: (type) => listeners.delete(type),
      speak(utterance) {
        spoken.push(utterance);
        if (autoStart) setImmediate(() => utterance.handlers.start?.());
        if (autoEnd) setImmediate(() => utterance.handlers.end?.());
      },
      cancel() {},
    },
    setTimeout,
    clearTimeout,
  };
  const source = fs.readFileSync(path.join(root, 'packages/core/narrator.js'), 'utf8');
  // The module is an IIFE taking `window`; run it with the fake as that argument.
  new Function('window', `${source.replace(/\}\)\(window\);\s*$/, '})(window);')}`)(window);
  return { narrator: window.__screenreelNarrator, spoken };
}

test('speak reports success and hands the engine the exact script', async () => {
  const { narrator, spoken } = loadNarrator();
  const result = await narrator.speak('  Revenue is up.  ');
  assert.equal(result.spoke, true);
  assert.equal(spoken.length, 1);
  assert.equal(spoken[0].text, 'Revenue is up.');
});

test('an empty script is silent rather than an error, and never reaches the engine', async () => {
  const { narrator, spoken } = loadNarrator();
  const result = await narrator.speak('   ');
  assert.equal(result.spoke, false);
  assert.equal(result.reason, 'empty');
  assert.equal(spoken.length, 0);
});

test('speak reports blocked when the engine never starts, so callers can offer an unmute', async () => {
  const { narrator } = loadNarrator({ autoStart: false, autoEnd: false });
  const result = await narrator.speak('Blocked by autoplay policy.');
  assert.equal(result.spoke, false);
  assert.equal(result.reason, 'blocked');
  assert.equal(narrator.speaking(), false, 'a refused utterance must not leave the narrator busy');
});

test('settle resolves immediately when silent and is bounded when speaking', async () => {
  const { narrator } = loadNarrator({ autoStart: true, autoEnd: false });
  await narrator.settle(50); // nothing queued yet
  await narrator.speak('A long note that never reports its end.');
  const started = Date.now();
  await narrator.settle(120);
  const waited = Date.now() - started;
  assert.ok(waited >= 100, `settle should wait for the cap, waited ${waited}ms`);
  assert.ok(waited < 1000, `settle must not exceed its cap, waited ${waited}ms`);
});

test('cancel releases a pending settle instead of leaving the tour awaiting forever', async () => {
  const { narrator } = loadNarrator({ autoStart: true, autoEnd: false });
  await narrator.speak('Interrupted mid-sentence.');
  assert.equal(narrator.speaking(), true);
  const settled = narrator.settle(5000);
  narrator.cancel();
  await settled; // would time out the test if cancel did not resolve it
  assert.equal(narrator.speaking(), false);
});

test('no speech engine is reported as unavailable rather than throwing', async () => {
  const source = fs.readFileSync(path.join(root, 'packages/core/narrator.js'), 'utf8');
  const window = { document: { documentElement: {} }, setTimeout, clearTimeout };
  new Function('window', source)(window);
  const narrator = window.__screenreelNarrator;
  assert.equal(narrator.available(), false);
  assert.deepEqual(await narrator.speak('anything'), { spoke: false, reason: 'unsupported' });
  await narrator.settle(10);
  narrator.cancel();
});
