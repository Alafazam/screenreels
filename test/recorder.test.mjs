import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Coalescer,
  SCROLL_BURST_GAP_MS,
  SCROLL_FLUSH_MS,
  SCROLL_DUR_MIN_MS,
  SCROLL_DUR_MAX_MS,
  IDLE_GAP_MIN_MS,
  IDLE_GAP_MAX_MS,
  CHAR_MS_MIN,
  CHAR_MS_MAX,
  NAV_ATTRIBUTION_MS,
  CHANGE_CLICK_MERGE_MS,
  SCROLL_MIN_VIEWPORT_PERCENT,
} from '../packages/studio/recorder.js';

const DEFAULTS = { type: { charMs: 45 }, 'scroll-by': { durMs: 800 }, lever: { durMs: 1200 }, highlight: { holdMs: 1600 }, spotlight: { holdMs: 1800, dim: 0.62 } };
const make = (route = '/') => new Coalescer({ definitionDefaults: (id) => DEFAULTS[id] || {}, route });
const appended = (ops) => ops.filter((op) => op.op === 'append').map((op) => op.action);

test('recorder constants are self-consistent', () => {
  assert(CHAR_MS_MIN < CHAR_MS_MAX);
  assert(IDLE_GAP_MIN_MS < IDLE_GAP_MAX_MS);
  // A flush timer shorter than the merge window would end a burst before a same-window scroll
  // event ever arrives, making the merge window dead code.
  assert(SCROLL_FLUSH_MS > SCROLL_BURST_GAP_MS);
  // A pause long enough to split a scroll burst must still fit under the idle-gap cap, or the
  // split-off pause couldn't be fully replayed as afterMs.
  assert(SCROLL_BURST_GAP_MS < IDLE_GAP_MAX_MS);
  assert(SCROLL_DUR_MIN_MS < SCROLL_DUR_MAX_MS);
  // durMs lands on a scroll-by action whose field spec is min:100,max:10000 (see
  // packages/core/action-runtime.js) and is enforced by validate() — a measured value must
  // never be one save() would reject.
  assert(SCROLL_DUR_MIN_MS >= 100 && SCROLL_DUR_MAX_MS <= 10000);
  assert(NAV_ATTRIBUTION_MS > 0 && CHANGE_CLICK_MERGE_MS > 0 && SCROLL_MIN_VIEWPORT_PERCENT > 0);
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

test('scroll bursts accumulate into one relative scroll with a measured duration', () => {
  const coalescer = make();
  const ops = [];
  for (let index = 0; index < 5; index++) ops.push(...coalescer.push({ kind: 'scroll', at: index * 60, selector: null, deltaX: 0, deltaY: 120, viewportW: 1280, viewportH: 800 }));
  ops.push(...coalescer.flush());
  const actions = appended(ops);
  assert.equal(actions.length, 1);
  // durMs is now the measured 240ms span (4 gaps of 60ms), not the registry's 800ms default.
  assert.deepEqual(actions[0], { type: 'scroll', definitionId: 'scroll-by', mode: 'relative', direction: 'down', amount: 75, unit: 'viewportPercent', durMs: 240 });
  // An isolated flick emits nothing: 4px is genuinely invisible (below SCROLL_MIN_VIEWPORT_PERCENT)
  // and flush() has nothing to attach it to. A flick followed by MORE scrolling is carried
  // forward instead of discarded — see the carry-accumulation test below.
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
  assert.equal(action.durMs, SCROLL_DUR_MIN_MS); // single event: firstAt === lastAt, pins the clamp floor
});

test('a mid-scroll pause under the burst gap keeps one action', () => {
  const coalescer = make();
  const ops = [];
  for (const at of [0, 400, 2000, 4200]) ops.push(...coalescer.push({ kind: 'scroll', at, selector: null, deltaX: 0, deltaY: 200, viewportW: 1280, viewportH: 800 }));
  ops.push(...coalescer.flush());
  const actions = appended(ops);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].amount, 100);
  assert.equal(actions[0].durMs, SCROLL_DUR_MAX_MS); // 4200ms span clamped to the ceiling
});

test('a pause longer than the burst gap splits the scroll, and the pause becomes afterMs', () => {
  const coalescer = make();
  const ops = [
    ...coalescer.push({ kind: 'scroll', at: 0, selector: null, deltaX: 0, deltaY: 400, viewportW: 1280, viewportH: 800 }),
    ...coalescer.push({ kind: 'scroll', at: 3000, selector: null, deltaX: 0, deltaY: 400, viewportW: 1280, viewportH: 800 }),
  ];
  ops.push(...coalescer.flush());
  assert.deepEqual(ops.map((op) => op.op), ['append', 'patchLast', 'append']);
  assert.deepEqual(appended(ops).map((action) => action.amount), [50, 50]);
  assert.equal(ops[1].patch.afterMs, 3000);
});

test('a sub-threshold tail updates the scroll it continues instead of charging afterMs', () => {
  const coalescer = make();
  coalescer.push({ kind: 'scroll', at: 0, selector: null, deltaX: 0, deltaY: 400, viewportW: 1280, viewportH: 800 });
  coalescer.push({ kind: 'scroll', at: 3000, selector: null, deltaX: 0, deltaY: 8, viewportW: 1280, viewportH: 800 });
  const flushOps = coalescer.flush();
  assert.deepEqual(flushOps.map((op) => op.op), ['patchLast']);
  assert.deepEqual(flushOps[0].patch, { amount: 51, durMs: 200 });
  assert.equal('afterMs' in flushOps[0].patch, false);
  /* The click lands 200ms after the tail's own lastAt (3000) — under IDLE_GAP_MIN_MS, so no
     afterMs patch should appear. Without the lastEmitted.at bump, the click's gap would be
     measured against the ORIGINAL burst's end (at: 0) instead, producing a spurious multi-second
     afterMs patch here — proving the bump is what suppresses it. */
  const clickOps = coalescer.push({ kind: 'click', at: 3200, selector: '#next' });
  assert.deepEqual(clickOps.map((op) => op.op), ['append']);
});

test('sub-threshold flicks accumulate across bursts instead of vanishing', () => {
  const coalescer = make();
  const ops = [];
  for (const at of [0, 3000, 6000, 9000, 12000]) ops.push(...coalescer.push({ kind: 'scroll', at, selector: null, deltaX: 0, deltaY: 10, viewportW: 1280, viewportH: 800 }));
  ops.push(...coalescer.flush());
  const appends = ops.filter((op) => op.op === 'append');
  const patches = ops.filter((op) => op.op === 'patchLast');
  // Today (pre-fix) this whole scroll produces zero actions: every 10px flick is below the 2%
  // floor on its own, and the old code dropped each one independently.
  assert.equal(appends.length, 1);
  assert(patches.length > 0);
  assert.equal(patches[patches.length - 1].patch.amount, 6);
});

test('a direction reversal inside a burst splits instead of cancelling', () => {
  const coalescer = make();
  const ops = [
    ...coalescer.push({ kind: 'scroll', at: 0, selector: null, deltaX: 0, deltaY: 400, viewportW: 1280, viewportH: 800 }),
    ...coalescer.push({ kind: 'scroll', at: 200, selector: null, deltaX: 0, deltaY: -400, viewportW: 1280, viewportH: 800 }),
  ];
  ops.push(...coalescer.flush());
  const actions = appended(ops);
  assert.deepEqual(actions.map((action) => action.direction), ['down', 'up']);
  assert.deepEqual(actions.map((action) => action.amount), [50, 50]);
  assert.equal(ops.some((op) => op.op === 'patchLast'), false); // 200ms turnaround is below IDLE_GAP_MIN_MS
});

test('jitter below the floor does not split the burst', () => {
  const coalescer = make();
  const ops = [
    ...coalescer.push({ kind: 'scroll', at: 0, selector: null, deltaX: 0, deltaY: 8, viewportW: 1280, viewportH: 800 }),
    ...coalescer.push({ kind: 'scroll', at: 100, selector: null, deltaX: 0, deltaY: -8, viewportW: 1280, viewportH: 800 }),
    ...coalescer.push({ kind: 'scroll', at: 200, selector: null, deltaX: 0, deltaY: 400, viewportW: 1280, viewportH: 800 }),
  ];
  ops.push(...coalescer.flush());
  const actions = appended(ops);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].direction, 'down');
  assert.equal(actions[0].amount, 50);
});

test('durMs is measured, clamped, and always inside the scroll-by field range', () => {
  const single = make();
  single.push({ kind: 'scroll', at: 0, selector: null, deltaX: 0, deltaY: 400, viewportW: 1280, viewportH: 800 });
  assert.equal(appended(single.flush())[0].durMs, SCROLL_DUR_MIN_MS);

  const midSpan = make();
  midSpan.push({ kind: 'scroll', at: 0, selector: null, deltaX: 0, deltaY: 400, viewportW: 1280, viewportH: 800 });
  midSpan.push({ kind: 'scroll', at: 1200, selector: null, deltaX: 0, deltaY: 0, viewportW: 1280, viewportH: 800 });
  assert.equal(appended(midSpan.flush())[0].durMs, 1200);

  // Chained in sub-burst-gap steps so the whole 9000ms stays one continuous burst — two events
  // 9000ms apart would split into two bursts instead of measuring one long span.
  const longSpan = make();
  for (const at of [0, 2000, 4000, 6000, 8000, 9000]) longSpan.push({ kind: 'scroll', at, selector: null, deltaX: 0, deltaY: at === 0 ? 400 : 0, viewportW: 1280, viewportH: 800 });
  assert.equal(appended(longSpan.flush())[0].durMs, SCROLL_DUR_MAX_MS);
});

test('a scroll on another container ends the burst and drops its sub-threshold carry', () => {
  const coalescer = make();
  const ops = [
    ...coalescer.push({ kind: 'scroll', at: 0, selector: '#panel', deltaX: 0, deltaY: 10, viewportW: 1280, viewportH: 800 }),
    ...coalescer.push({ kind: 'scroll', at: 100, selector: null, deltaX: 0, deltaY: 400, viewportW: 1280, viewportH: 800 }),
  ];
  ops.push(...coalescer.flush());
  const actions = appended(ops);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].selector, undefined);
  assert.equal(actions[0].amount, 50);
});

test('a click clears a pending carry so it cannot leak into a later scroll', () => {
  const coalescer = make();
  const ops = [
    ...coalescer.push({ kind: 'scroll', at: 0, selector: null, deltaX: 0, deltaY: 10, viewportW: 1280, viewportH: 800 }),
    ...coalescer.push({ kind: 'click', at: 50, selector: '#go' }),
    ...coalescer.push({ kind: 'scroll', at: 100, selector: null, deltaX: 0, deltaY: 400, viewportW: 1280, viewportH: 800 }),
  ];
  ops.push(...coalescer.flush());
  const scrollAction = appended(ops).find((action) => action.type === 'scroll');
  assert.equal(scrollAction.amount, 50); // not 51 — the 10px carry from before the click must not survive it
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

test('recorded actions carry the target fingerprint so the doctor can repair them', () => {
  const coalescer = make();
  const fingerprint = { text: 'Rock the demo', tag: 'button', role: '' };
  const clicked = appended(coalescer.push({ kind: 'click', at: 0, selector: '#submit', fingerprint }));
  assert.deepEqual(clicked[0].fingerprint, fingerprint);
  const typed = make();
  const field = { text: '', tag: 'input', role: '' };
  typed.push({ kind: 'input', at: 0, selector: '#name', fingerprint: field, value: 'A' });
  typed.push({ kind: 'input', at: 60, selector: '#name', fingerprint: field, value: 'Ac' });
  assert.deepEqual(appended(typed.flush())[0].fingerprint, field);
  // A scroll has no meaningful element identity, so it stays fingerprint-free.
  const scrolled = make();
  scrolled.push({ kind: 'scroll', at: 0, selector: null, deltaX: 0, deltaY: 900, viewportW: 1000, viewportH: 1000 });
  assert.equal(appended(scrolled.flush())[0].fingerprint, undefined);
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

test('a modifier-click annotate record emits highlight or spotlight with registry defaults', () => {
  const highlighted = appended(make().push({ kind: 'annotate', annotation: 'highlight', at: 0, selector: '#hero', fingerprint: { text: 'Hero', tag: 'div', role: '' } }));
  assert.deepEqual(highlighted[0], { type: 'highlight', definitionId: 'highlight', selector: '#hero', holdMs: 1600, fingerprint: { text: 'Hero', tag: 'div', role: '' } });
  const spotlit = appended(make().push({ kind: 'annotate', annotation: 'spotlight', at: 0, selector: '#panel' }));
  assert.deepEqual(spotlit[0], { type: 'spotlight', definitionId: 'spotlight', selector: '#panel', holdMs: 1800, dim: 0.62 });
});

test('an annotate finalizes a pending typing burst first, preserving order', () => {
  const coalescer = make();
  const ops = [];
  ops.push(...coalescer.push({ kind: 'input', at: 0, selector: '#name', value: 'Hi' }));
  ops.push(...coalescer.push({ kind: 'annotate', annotation: 'highlight', at: 100, selector: '#hero' }));
  const actions = appended(ops);
  assert.deepEqual(actions.map((action) => action.type), ['type', 'highlight']);
  assert.equal(actions[1].selector, '#hero');
});

test('an idle gap before an annotate patches afterMs onto the previous action', () => {
  const coalescer = make();
  const ops = [
    ...coalescer.push({ kind: 'click', at: 0, selector: '#a' }),
    ...coalescer.push({ kind: 'annotate', annotation: 'spotlight', at: 1240, selector: '#b' }),
  ];
  assert.deepEqual(ops.map((op) => op.op), ['append', 'patchLast', 'append']);
  assert.equal(ops[1].patch.afterMs, 1200);
  assert.equal(ops[2].action.type, 'spotlight');
});
