import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Coalescer,
  SCROLL_SETTLE_MS,
  IDLE_GAP_MIN_MS,
  IDLE_GAP_MAX_MS,
  CHAR_MS_MIN,
  CHAR_MS_MAX,
  NAV_ATTRIBUTION_MS,
  CHANGE_CLICK_MERGE_MS,
  SCROLL_MIN_VIEWPORT_PERCENT,
} from '../packages/studio/recorder.js';

const DEFAULTS = { type: { charMs: 45 }, 'scroll-by': { durMs: 800 }, lever: { durMs: 1200 } };
const make = (route = '/') => new Coalescer({ definitionDefaults: (id) => DEFAULTS[id] || {}, route });
const appended = (ops) => ops.filter((op) => op.op === 'append').map((op) => op.action);

test('recorder constants are self-consistent', () => {
  assert(CHAR_MS_MIN < CHAR_MS_MAX);
  assert(IDLE_GAP_MIN_MS < IDLE_GAP_MAX_MS);
  assert(SCROLL_SETTLE_MS > 0 && NAV_ATTRIBUTION_MS > 0 && CHANGE_CLICK_MERGE_MS > 0 && SCROLL_MIN_VIEWPORT_PERCENT > 0);
});

test('a keystroke burst coalesces into one type action with median charMs', () => {
  const coalescer = make();
  const ops = [];
  let at = 1000;
  for (const value of ['N', 'No', 'Nor', 'Nort', 'North']) { ops.push(...coalescer.push({ kind: 'input', at, selector: '#name', value })); at += 60; }
  ops.push(...coalescer.flush());
  const actions = appended(ops);
  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0], { type: 'type', definitionId: 'type', selector: '#name', text: 'North', clearFirst: true, charMs: 60 });
});

test('typing speed is clamped and a single keystroke falls back to the registry default', () => {
  const fast = make();
  fast.push({ kind: 'input', at: 0, selector: '#a', value: 'x' });
  fast.push({ kind: 'input', at: 5, selector: '#a', value: 'xy' });
  assert.equal(appended(fast.flush())[0].charMs, CHAR_MS_MIN);
  const slow = make();
  slow.push({ kind: 'input', at: 0, selector: '#a', value: 'x' });
  slow.push({ kind: 'input', at: 900, selector: '#a', value: 'xy' });
  assert.equal(appended(slow.flush())[0].charMs, CHAR_MS_MAX);
  const single = make();
  single.push({ kind: 'input', at: 0, selector: '#a', value: 'x' });
  assert.equal(appended(single.flush())[0].charMs, 45);
});

test('a click finalizes pending typing first, preserving order', () => {
  const coalescer = make();
  const ops = [];
  ops.push(...coalescer.push({ kind: 'input', at: 0, selector: '#name', value: 'Hi' }));
  ops.push(...coalescer.push({ kind: 'click', at: 100, selector: '#go' }));
  const actions = appended(ops);
  assert.deepEqual(actions.map((action) => action.type), ['type', 'click']);
  assert.equal(actions[1].selector, '#go');
});

test('change events map to toggle, set, lever, and radio click', () => {
  const coalescer = make();
  const actions = appended([
    ...coalescer.push({ kind: 'change', at: 0, selector: '#p', control: 'checkbox', checked: true }),
    ...coalescer.push({ kind: 'change', at: 10000, selector: '#r', control: 'select', value: 'West' }),
    ...coalescer.push({ kind: 'change', at: 20000, selector: '#c', control: 'range', value: '80' }),
    ...coalescer.push({ kind: 'change', at: 30000, selector: '#opt', control: 'radio' }),
    ...coalescer.push({ kind: 'change', at: 40000, selector: '#d', control: 'value', value: '2026-07-30' }),
  ]);
  assert.deepEqual(actions.map((action) => [action.type, action.selector]), [['toggle', '#p'], ['set', '#r'], ['lever', '#c'], ['click', '#opt'], ['set', '#d']]);
  assert.equal(actions[0].checked, true);
  assert.equal(actions[2].to, '80');
  assert.equal(actions[2].durMs, 1200);
});

test('a change right after a same-target click replaces the click (label-wrapped controls)', () => {
  const coalescer = make();
  const ops = [
    ...coalescer.push({ kind: 'click', at: 0, selector: '#fancy-switch' }),
    ...coalescer.push({ kind: 'change', at: 40, selector: '#fancy-switch', control: 'checkbox', checked: true }),
  ];
  assert.deepEqual(ops.map((op) => op.op), ['append', 'replaceLast']);
  assert.equal(ops[1].action.type, 'toggle');
});

test('scroll bursts accumulate into one relative scroll and sub-threshold noise is dropped', () => {
  const coalescer = make();
  const ops = [];
  for (let index = 0; index < 5; index++) ops.push(...coalescer.push({ kind: 'scroll', at: index * 60, selector: null, deltaX: 0, deltaY: 120, viewportW: 1280, viewportH: 800 }));
  ops.push(...coalescer.flush());
  const actions = appended(ops);
  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0], { type: 'scroll', definitionId: 'scroll-by', mode: 'relative', direction: 'down', amount: 75, unit: 'viewportPercent', durMs: 800 });
  const noise = make();
  noise.push({ kind: 'scroll', at: 0, selector: null, deltaX: 0, deltaY: 4, viewportW: 1280, viewportH: 800 });
  assert.equal(appended(noise.flush()).length, 0);
});

test('container scrolls carry the container selector and horizontal wins by dominant axis', () => {
  const coalescer = make();
  coalescer.push({ kind: 'scroll', at: 0, selector: '#panel', deltaX: -400, deltaY: 10, viewportW: 1000, viewportH: 800 });
  const [action] = appended(coalescer.flush());
  assert.equal(action.selector, '#panel');
  assert.equal(action.direction, 'left');
  assert.equal(action.amount, 40);
});

test('idle gaps become afterMs on the previous action, rounded and capped', () => {
  const coalescer = make();
  const ops = [
    ...coalescer.push({ kind: 'click', at: 0, selector: '#a' }),
    ...coalescer.push({ kind: 'click', at: 1240, selector: '#b' }),
    ...coalescer.push({ kind: 'click', at: 1440, selector: '#c' }),   // 200ms gap: below threshold
    ...coalescer.push({ kind: 'click', at: 20000, selector: '#d' }),  // huge gap: capped
  ];
  const patches = ops.filter((op) => op.op === 'patchLast').map((op) => op.patch.afterMs);
  assert.deepEqual(patches, [1200, IDLE_GAP_MAX_MS]);
});

test('navigation right after a click replaces it with goto; otherwise appends goto', () => {
  const attributed = make('/');
  const ops = [
    ...attributed.push({ kind: 'click', at: 0, selector: '#open-next' }),
    ...attributed.navigate('/destination.html', 400),
  ];
  assert.deepEqual(ops.map((op) => op.op), ['append', 'replaceLast']);
  assert.deepEqual(ops[1].action, { type: 'goto', definitionId: 'goto', url: '/destination.html' });
  const cold = make('/');
  const coldOps = cold.navigate('/other.html', 10000);
  assert.deepEqual(appended(coldOps).map((action) => action.type), ['goto']);
});

test('navigating to the identical route emits nothing', () => {
  const coalescer = make('/here');
  assert.deepEqual(coalescer.navigate('/here', 100), []);
});

test('flush finalizes pending state exactly once', () => {
  const coalescer = make();
  const ops = [];
  ops.push(...coalescer.push({ kind: 'input', at: 0, selector: '#a', value: 'x' }));
  // The scroll record finalizes the pending type eagerly so ordering is preserved.
  ops.push(...coalescer.push({ kind: 'scroll', at: 100, selector: null, deltaX: 0, deltaY: 500, viewportW: 1000, viewportH: 1000 }));
  ops.push(...coalescer.flush());
  assert.deepEqual(appended(ops).map((action) => action.type), ['type', 'scroll']);
  assert.deepEqual(coalescer.flush(), []);
});

test('a text-field change commits pending typing without emitting a second action', () => {
  const coalescer = make();
  const ops = [];
  ops.push(...coalescer.push({ kind: 'input', at: 0, selector: '#name', value: 'Acme' }));
  ops.push(...coalescer.push({ kind: 'change', at: 50, selector: '#name', control: 'text', value: 'Acme' }));
  ops.push(...coalescer.flush());
  assert.deepEqual(appended(ops).map((action) => action.type), ['type']);
});
