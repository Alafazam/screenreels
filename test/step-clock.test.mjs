import test from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import '../packages/core/step-clock.js';
import { planPace, actionSelfMs, estimateSceneSeconds } from '../packages/studio/pacing.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createStepClock, planSteps, validateTimedSteps, isTimedAction, AUDIO_OVERRUN_CAP_MS } = globalThis.ScreenReelStepClock;

/* A manual clock: time moves only when the test says so, and due timers fire in order. Lets every
   timing assertion be exact instead of a wall-clock tolerance. */
function fakeTimers() {
  let now = 0; let nextId = 1; const timers = new Map();
  return {
    now: () => now,
    setTimeout: (fn, ms) => { const id = nextId++; timers.set(id, { at: now + Math.max(0, ms), fn }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    async advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, timer] = due; timers.delete(id); now = timer.at; timer.fn();
        await Promise.resolve();
      }
      now = target; await Promise.resolve(); await Promise.resolve();
    },
    pending: () => timers.size,
  };
}
const settledWith = (promise) => { const box = { done: false, value: undefined }; promise.then((value) => { box.done = true; box.value = value; }); return box; };

test('a wait that is early resolves exactly at its offset from t0', async () => {
  const timers = fakeTimers(); const clock = createStepClock(timers).start(5000);
  const wait = settledWith(clock.waitUntil(1200));
  await timers.advance(1199);
  assert.equal(wait.done, false, 'must not run before atMs');
  await timers.advance(1);
  assert.equal(wait.done, true);
  assert.deepEqual(wait.value, { aborted: false, lateMs: 0 });
  assert.equal(clock.elapsed(), 1200);
});

test('a late action runs at once and the next one is still measured from t0 (no drift accumulates)', async () => {
  const timers = fakeTimers(); const clock = createStepClock(timers).start(6000);
  await timers.advance(1500); // the previous action overran: it was due at 1000
  const late = await clock.waitUntil(1000);
  assert.deepEqual(late, { aborted: false, lateMs: 500 }, 'catches up immediately and reports how late');
  const next = settledWith(clock.waitUntil(2000));
  await timers.advance(499);
  assert.equal(next.done, false);
  await timers.advance(1);
  assert.equal(next.done, true, 'the next action lands on t0 + 2000, not 2000 after the late one');
  assert.equal(clock.elapsed(), 2000);
});

test('pause freezes the clock and its waits; resume continues from where it was', async () => {
  const timers = fakeTimers(); const clock = createStepClock(timers).start(4000);
  const wait = settledWith(clock.waitUntil(1000));
  await timers.advance(600);
  clock.pause();
  assert.equal(clock.paused(), true);
  await timers.advance(5000);
  assert.equal(wait.done, false, 'a paused clock never releases a wait');
  assert.equal(clock.elapsed(), 600, 'paused time is not counted');
  clock.resume();
  await timers.advance(399);
  assert.equal(wait.done, false);
  await timers.advance(1);
  assert.equal(wait.done, true);
  assert.equal(clock.elapsed(), 1000);
  assert.deepEqual(clock.state(), { stepMs: 4000, elapsedMs: 1000, paused: false, running: true });
});

test('a wait created while paused is held until resume, even when already due', async () => {
  const timers = fakeTimers(); const clock = createStepClock(timers).start(3000);
  await timers.advance(800);
  clock.pause();
  const wait = settledWith(clock.waitUntil(500));
  await timers.advance(1000);
  assert.equal(wait.done, false);
  clock.resume();
  await timers.advance(0);
  assert.equal(wait.done, true);
  assert.equal(wait.value.lateMs, 300);
});

test('back restarts the step: elapsed returns to 0 and pending waits measure from the new t0', async () => {
  const timers = fakeTimers(); const clock = createStepClock(timers).start(5000);
  const wait = settledWith(clock.waitUntil(2000));
  await timers.advance(1500);
  clock.restart();
  assert.equal(clock.elapsed(), 0);
  assert.equal(clock.stepMs(), 5000, 'restart keeps the step length');
  await timers.advance(1999);
  assert.equal(wait.done, false);
  await timers.advance(1);
  assert.equal(wait.done, true);
});

test('mute keeps the timing: the clock fires on the same offsets with the audio stopped mid-step', async () => {
  // The projector mutes by stopping the audio narrator; the clock has no notion of sound.
  const audioSource = fs.readFileSync(path.join(root, 'packages/core/audio-narrator.js'), 'utf8');
  const run = async (muteAfterMs) => {
    const window = { Audio: class { constructor(src) { this.src = src; this.paused = true; } addEventListener() {} removeEventListener() {} removeAttribute() {} play() { this.paused = false; return Promise.resolve(); } pause() { this.paused = true; } } };
    new Function('window', audioSource)(window);
    const audio = window.__screenreelAudioNarrator;
    const timers = fakeTimers(); const clock = createStepClock(timers).start(3000); const fired = [];
    await audio.play('step.mp3');
    for (const at of [0, 700, 1900]) clock.waitUntil(at).then(() => { fired.push(timers.now()); if (timers.now() >= muteAfterMs) audio.stop(); });
    await Promise.resolve(); // the wait at 0 is already due: let it land before time moves
    await timers.advance(3000);
    return { fired, playing: audio.playing() };
  };
  const withSound = await run(Infinity);
  const muted = await run(500);
  assert.deepEqual(withSound.fired, [0, 700, 1900]);
  assert.deepEqual(muted.fired, withSound.fired);
  assert.equal(withSound.playing, true);
  assert.equal(muted.playing, false, 'the muted run really did stop the audio');
});

test('an abort signal or stop() releases every pending wait as aborted', async () => {
  const timers = fakeTimers(); const clock = createStepClock(timers).start(3000);
  const controller = new AbortController();
  const aborted = settledWith(clock.waitUntil(2000, controller.signal));
  const stopped = settledWith(clock.waitUntil(2500));
  controller.abort(); await timers.advance(0);
  assert.deepEqual(aborted.value, { aborted: true, lateMs: 0 });
  assert.equal(stopped.done, false);
  clock.stop(); await timers.advance(0);
  assert.deepEqual(stopped.value, { aborted: true, lateMs: 0 });
  assert.equal(timers.pending(), 0, 'no timer outlives the step');
  assert.equal(clock.running(), false);
});

test('planSteps places each action on its card\'s timeline, and only after a card with stepMs', () => {
  const actions = [
    { type: 'click', selector: '#a', atMs: 100 },                 // before any card: not timed
    { type: 'callout', selector: '#b', stepMs: 4000 },
    { type: 'click', selector: '#c', atMs: 900 },
    { type: 'highlight', selector: '#d' },                        // in the step, no atMs: runs in sequence
    { type: 'callout', selector: '#e', holdMs: 2000 },            // an untimed card ends the timed step
    { type: 'click', selector: '#f', atMs: 300 },                 // atMs without a timed card: ignored
  ];
  assert.deepEqual(planSteps(actions), [
    { owner: -1, stepMs: null, atMs: null },
    { owner: 1, stepMs: 4000, atMs: null },
    { owner: 1, stepMs: 4000, atMs: 900 },
    { owner: 1, stepMs: 4000, atMs: null },
    { owner: -1, stepMs: null, atMs: null },
    { owner: -1, stepMs: null, atMs: null },
  ]);
  assert.deepEqual(planSteps(undefined), []);
});

test('a flow without stepMs has no timed actions at all', () => {
  const actions = [{ type: 'callout', selector: '#a', holdMs: 2200 }, { type: 'click', selector: '#b', afterMs: 600 }, { type: 'highlight', selector: '#c' }];
  assert.ok(planSteps(actions).every((place) => place.owner === -1 && place.atMs === null));
  assert.equal(actions.some(isTimedAction), false);
  assert.deepEqual(validateTimedSteps(actions), []);
});

test('validateTimedSteps reports each timing mistake against its action', () => {
  const problems = validateTimedSteps([
    { type: 'glow', selector: '#x', sequence: true, stepMs: 1000 }, // a glow's own beat, not a step
    { type: 'callout', selector: '#a', stepMs: -5 },
    { type: 'click', selector: '#b', atMs: 200 },
    { type: 'callout', selector: '#c', stepMs: 2000, narrationAudio: '', atMs: 10 },
    { type: 'click', selector: '#d', atMs: 1500 },
    { type: 'click', selector: '#e', atMs: 900 },
    { type: 'click', selector: '#f', atMs: 2500, narrationAudio: 'a.mp3' },
    { type: 'click', selector: '#g', atMs: 'soon' },
  ]);
  const messages = problems.map((problem) => `${problem.actionIndex}: ${problem.message}`);
  assert.deepEqual(messages, [
    '1: stepMs must be a positive number of milliseconds',
    '2: atMs is ignored: no earlier info card in this scene sets stepMs',
    '3: narrationAudio must be the URL of an audio file',
    '3: atMs is not read on an info card: the card starts its step',
    '5: atMs 900 is earlier than the action before it (1500); it will run late',
    '6: narrationAudio is only read on an info card (callout)',
    "6: atMs 2500 is past the step's stepMs 2000",
    '7: atMs must be a number of milliseconds, 0 or more',
  ]);
});

test('the audio overrun cap is a named constant the projector reads', () => {
  assert.equal(AUDIO_OVERRUN_CAP_MS, 1500);
});

const DEF_CALLOUT = { id: 'callout', type: 'callout', defaults: { holdMs: 2200 }, fields: [{ key: 'holdMs', type: 'number' }] };
const DEF_CLICK = { id: 'click', type: 'click', defaults: { afterMs: 700 }, fields: [] };

test('the pacer never stretches a timed step: its timeline is authoritative', () => {
  const card = { type: 'callout', holdMs: 3000, stepMs: 3000 };
  assert.deepEqual(planPace(card, DEF_CALLOUT, 9000), { holdMs: 3000, pace: null, addedMs: 0, field: 'holdMs', capped: false });
  const click = { type: 'click', afterMs: 600, atMs: 900 };
  assert.equal(planPace(click, DEF_CLICK, 9000).addedMs, 0);
  // A pace added before the step was timed is taken back off, not kept.
  const paced = { type: 'callout', holdMs: 5000, stepMs: 3000, pace: { field: 'holdMs', addedMs: 2000 } };
  assert.deepEqual(planPace(paced, DEF_CALLOUT, 9000), { holdMs: 3000, pace: null, addedMs: 0, field: 'holdMs', capped: false });
  // An untimed card is still paced as before.
  assert.ok(planPace({ type: 'callout', holdMs: 1000 }, DEF_CALLOUT, 9000).addedMs > 0);
});

test('a timed card lasts its stepMs and its step\'s actions add nothing to the scene estimate', () => {
  assert.equal(actionSelfMs({ type: 'callout', holdMs: 1000, stepMs: 4200 }, DEF_CALLOUT), 4200);
  const scene = { actions: [{ type: 'callout', stepMs: 4000 }, { type: 'click', afterMs: 600, atMs: 500 }, { type: 'callout', stepMs: 3000 }] };
  assert.equal(estimateSceneSeconds(scene, {}, () => 0), 7);
});
