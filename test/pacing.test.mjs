import test from 'node:test';
import assert from 'node:assert/strict';
import { actionSelfMs, planPace, estimateSceneSeconds } from '../packages/studio/pacing.js';

/* Definition literals rather than the live registry: pacing.js reaches ScreenReelCore through a
   guarded window lookup that is absent in Node, which is exactly the isolation these tests want. */
const DEF_HIGHLIGHT = { id: 'highlight', type: 'highlight', label: 'Highlight target', defaults: { holdMs: 1600 }, fields: [{ key: 'holdMs', type: 'number' }] };
const DEF_CLICK = { id: 'click', type: 'click', label: 'Click target', defaults: { afterMs: 700 }, fields: [] };
const DEF_WAIT = { id: 'wait', type: 'wait', label: 'Wait duration', defaults: { ms: 1000 }, fields: [{ key: 'ms', type: 'number' }] };
const DEF_GOTO = { id: 'goto', type: 'goto', label: 'Navigate', defaults: { url: '/' }, fields: [{ key: 'url', type: 'text' }] };
const DEF_CHOICE = { id: 'choice', type: 'choice', label: 'Viewer choice', defaults: { timeoutMs: 0 }, fields: [{ key: 'timeoutMs', type: 'number' }] };
const DEF_WAIT_FOR = { id: 'wait-for', type: 'waitFor', label: 'Wait for target', defaults: { timeoutMs: 8000 }, fields: [{ key: 'timeoutMs', type: 'number' }] };
const DEF_COUNTDOWN = { id: 'countdown', type: 'countdown', label: 'Play countdown', defaults: { from: 3, stepMs: 720 }, fields: [{ key: 'from', type: 'number' }, { key: 'stepMs', type: 'number' }] };

// Applies a plan the way Studio.applyPace does, so idempotence is tested through the real cycle.
const apply = (action, plan) => { const next = { ...action, [plan.field]: plan[plan.field] }; if (plan.pace) next.pace = plan.pace; else delete next.pace; return next; };

test('an action with no timing of its own falls back to its registry default', () => {
  assert.equal(actionSelfMs({ type: 'highlight' }, DEF_HIGHLIGHT), 1600);
  assert.equal(actionSelfMs({ type: 'highlight', holdMs: 900 }, DEF_HIGHLIGHT), 900);
  assert.equal(actionSelfMs({ type: 'click', afterMs: 700 }, DEF_CLICK), 0); // afterMs is the caller's to add
});

test('a countdown lasts from…1 plus "Go", not one step', () => {
  assert.equal(actionSelfMs({ type: 'countdown', from: 3, stepMs: 720 }, DEF_COUNTDOWN), 2880);
  assert.equal(actionSelfMs({ type: 'countdown' }, DEF_COUNTDOWN), 2880);
  assert.equal(actionSelfMs({ type: 'countdown', from: 1, stepMs: 500 }, DEF_COUNTDOWN), 1000);
});

test('a typed action counts its characters and a sequence counts its steps', () => {
  assert.equal(actionSelfMs({ type: 'type', text: 'North', charMs: 100 }, null), 500);
  assert.equal(actionSelfMs({ type: 'glow', sequence: true, count: 4, stepMs: 1000 }, null), 4000);
});

test('a holdMs-bearing definition is extended on holdMs, not afterMs', () => {
  const plan = planPace({ type: 'highlight', holdMs: 1600 }, DEF_HIGHLIGHT, 3000);
  assert.equal(plan.field, 'holdMs');
  assert.equal(plan.holdMs, 3300);          // 3000 + 250 pad - 1600 window = 1650, rounded up to 1700
  assert.equal(plan.addedMs, 1700);
  assert.deepEqual(plan.pace, { field: 'holdMs', addedMs: 1700 });
  assert.equal(plan.capped, false);
  assert.equal(plan.afterMs, undefined);
});

test('a click has no duration field of its own, so the delay after it absorbs the line', () => {
  const plan = planPace({ type: 'click', afterMs: 700 }, DEF_CLICK, 3000);
  assert.equal(plan.field, 'afterMs');
  assert.equal(plan.afterMs, 3300);
});

test('a wait is extended on ms', () => {
  const plan = planPace({ type: 'wait', ms: 1000 }, DEF_WAIT, 4000);
  assert.equal(plan.field, 'ms');
  assert.equal(plan.ms, 4300);
});

test('pacing the same action twice produces the identical value', () => {
  const first = planPace({ type: 'highlight', holdMs: 1600 }, DEF_HIGHLIGHT, 3000);
  const paced = apply({ type: 'highlight', holdMs: 1600 }, first);
  const second = planPace(paced, DEF_HIGHLIGHT, 3000);
  assert.equal(second.holdMs, first.holdMs);
  assert.deepEqual(second.pace, first.pace);
  const third = planPace(apply(paced, second), DEF_HIGHLIGHT, 3000);
  assert.equal(third.holdMs, first.holdMs);
});

test('shortening the line gives the author their own number back and forgets the pacing', () => {
  const paced = apply({ type: 'highlight', holdMs: 1600 }, planPace({ type: 'highlight', holdMs: 1600 }, DEF_HIGHLIGHT, 6000));
  assert.equal(paced.holdMs, 6300); // 6000 + 250 pad - 1600 = 4650, rounded up to 4700
  const shorter = planPace(paced, DEF_HIGHLIGHT, 3000);
  assert.equal(shorter.holdMs, 3300);
  const blanked = planPace(paced, DEF_HIGHLIGHT, 0);
  assert.equal(blanked.holdMs, 1600);
  assert.equal(blanked.pace, null);
  assert.equal(blanked.addedMs, 0);
});

test('a hold already longer than the line is left exactly as the author set it', () => {
  const plan = planPace({ type: 'highlight', holdMs: 9000 }, DEF_HIGHLIGHT, 3000);
  assert.equal(plan.holdMs, 9000);
  assert.equal(plan.pace, null);
  assert.equal(plan.addedMs, 0);
});

test('actions whose length is decided at play time are never paced', () => {
  for (const [action, definition] of [[{ type: 'goto', url: '/next' }, DEF_GOTO], [{ type: 'choice' }, DEF_CHOICE], [{ type: 'waitFor', selector: '#x' }, DEF_WAIT_FOR]]) {
    const plan = planPace(action, definition, 9000);
    assert.equal(plan.pace, null, `${action.type} must not be paced`);
    assert.equal(plan.addedMs, 0);
  }
});

test('a line no single action can hold reports capped instead of silently truncating', () => {
  const plan = planPace({ type: 'highlight', holdMs: 1600 }, DEF_HIGHLIGHT, 600 * 62);
  assert.equal(plan.holdMs, 30000);
  assert.equal(plan.capped, true);
  assert.equal(plan.addedMs, 28400);
});

test('a scene line adds only the part that outlives the actions, capped', () => {
  const scene = { dwellMs: 0, settleMs: 0, narration: 'long', actions: [{ type: 'wait', ms: 1000 }] };
  assert.equal(estimateSceneSeconds(scene, null, () => 5000), 5);   // 1000 action + 4000 remainder
  assert.equal(estimateSceneSeconds(scene, null, () => 20000), 7);  // 1000 + 6000 default settle cap
});

test('narrationCapMs bounds how long a scene waits for its own narration', () => {
  const scene = { dwellMs: 0, settleMs: 0, narration: 'long', narrationCapMs: 2000, actions: [{ type: 'wait', ms: 1000 }] };
  assert.equal(estimateSceneSeconds(scene, null, () => 20000), 3);
});

test("an action's own line replaces whatever is still speaking", () => {
  const scene = { dwellMs: 0, settleMs: 0, narration: 'scene', actions: [{ type: 'wait', ms: 10000 }, { type: 'wait', narration: 'action' }] };
  const estimator = (text) => (text === 'action' ? 4000 : 20000);
  assert.equal(estimateSceneSeconds(scene, null, estimator), 14); // 10000 + the replacing line's 4000
});

test('the scene estimate uses the same countdown arithmetic the runtime plays', () => {
  const scene = { dwellMs: 0, settleMs: 0, actions: [{ type: 'countdown', from: 3, stepMs: 720 }] };
  assert.equal(estimateSceneSeconds(scene, null, () => 0), 3); // 2880ms
});
