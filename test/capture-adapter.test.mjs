import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

/* Runs the Capture adapter (packages/capture/inject-adapter.js) with the real step clock in a fake
   page. The action runtime is a stub that records when each action starts and what context it got,
   so the test checks the timed-step rules Capture shares with the Projector. Times are real but
   small, so each check allows a tolerance. */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const TOLERANCE_MS = 60;

function fakePage({ actionMs = 0 } = {}) {
  const calls = [];
  const shown = [];
  const sandbox = { console: { warn: () => {} }, setTimeout, clearTimeout, performance, Date, document: {}, location: {} };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source('packages/core/step-clock.js'), sandbox);
  let t0 = null;
  sandbox.ScreenReelCore = {
    async runAction(action, context) {
      t0 ??= performance.now();
      calls.push({ type: action.type, id: action.id, atStart: performance.now() - t0, context });
      if (actionMs) await new Promise((resolve) => setTimeout(resolve, actionMs));
      if (context.retain) context.retain(() => calls.push({ type: 'release', id: action.id, atStart: performance.now() - t0 }));
      return { ok: true };
    },
    waitFor: async () => {},
  };
  sandbox.__screenreelStepShown = (info) => shown.push(info);
  vm.runInContext(source('packages/capture/inject-adapter.js'), sandbox);
  return { adapter: sandbox.__screenreel, calls, shown };
}

const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= TOLERANCE_MS, `${label}: ${Math.round(actual)} ms, expected about ${expected} ms`);

test('a timed card stays up for its step; actions run at atMs; the gate waits for the step end', async () => {
  const { adapter, calls, shown } = fakePage();
  await adapter.runActions({ id: 's1', actions: [
    { id: 'card', type: 'callout', stepMs: 400 },
    { id: 'a', type: 'click', atMs: 100 },
    { id: 'b', type: 'click', atMs: 250 },
    { id: 'gate', type: 'goto' },
  ] });
  const at = (id, type) => calls.find((call) => call.id === id && (!type || call.type === type)).atStart;
  near(at('a'), 100, 'action a');
  near(at('b'), 250, 'action b');
  near(at('card', 'release'), 400, 'card released at stepMs');
  near(at('gate'), 400, 'gate after the step');
  const card = calls.find((call) => call.id === 'card' && call.type === 'callout').context;
  assert.equal(card.persist, true); assert.equal(card.skipHold, true); assert.equal(card.noDim, true);
  assert.equal(calls.find((call) => call.id === 'a').context.noDim, true);
  assert.equal(calls.find((call) => call.id === 'gate').context.noDim, undefined);
  assert.equal(shown.length, 1); assert.equal(shown[0].sceneId, 's1'); assert.equal(shown[0].index, 0);
  assert.equal(typeof shown[0].at, 'number');
});

test('a step waits for a longer narration file, but no more than the overrun cap', async () => {
  const { adapter, calls } = fakePage();
  // stepMs 200, file 500 ms: the cap is 200 + 1500, so the step ends when the file ends.
  await adapter.runActions({ id: 's', actions: [{ id: 'c1', type: 'callout', stepMs: 200 }, { id: 'next', type: 'callout' }] }, null, { audioMs: { 0: 500 } });
  near(calls.find((call) => call.id === 'next').atStart, 500, 'next card after the file');
});

test('a narration file far longer than its step is cut off by the overrun cap', async () => {
  const { adapter, calls } = fakePage();
  // stepMs 100, file 5000 ms: the step ends at 100 + AUDIO_OVERRUN_CAP_MS (1500), not at 5000.
  await adapter.runActions({ id: 's', actions: [{ id: 'c1', type: 'callout', stepMs: 100 }, { id: 'next', type: 'callout' }] }, null, { audioMs: { 0: 5000 } });
  near(calls.find((call) => call.id === 'next').atStart, 1600, 'next card at the cap');
});

test('a late action runs at once and the next one is still timed from the card', async () => {
  const { adapter, calls } = fakePage({ actionMs: 150 });
  await adapter.runActions({ id: 's', actions: [
    { id: 'card', type: 'callout', stepMs: 300 },
    { id: 'slow', type: 'click', atMs: 0 },
    { id: 'late', type: 'click', atMs: 50 },
    { id: 'onTime', type: 'click', atMs: 280 },
  ] });
  const at = (id) => calls.find((call) => call.id === id).atStart;
  // The card itself takes 150 ms here too, so 'slow' starts at 150 and 'late' at 300.
  near(at('late'), 300, 'late action runs as soon as the one before it ends');
  near(at('onTime'), 450, 'the busy queue only delays, it does not add up');
});

test('untimed scenes run in order exactly as before, and nothing is reported', async () => {
  const { adapter, calls, shown } = fakePage();
  await adapter.runActions({ id: 's', actions: [{ id: 'c', type: 'callout', holdMs: 10 }, { id: 'x', type: 'click' }] });
  assert.deepEqual(calls.map((call) => call.id), ['c', 'x']);
  assert.equal(calls[0].context.persist, undefined);
  assert.deepEqual(shown, []);
});
