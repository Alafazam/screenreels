import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'packages/core/cursor.js'), 'utf8');

/* cursor.js is a browser IIFE invoked as `(globalThis)`, not an ES module — it has to stay that
   way, since it's loaded both as a plain <script> by the Projector and injected as raw text by
   Capture's addInitScript, neither of which parses `export`. So, like narrator.test.mjs does for
   narrator.js, load a fresh copy against a minimal DOM-free fake and drive its requestAnimationFrame
   loop by hand — that gives full control over `now` without any real timers or real time passing. */
function loadCursor({ innerWidth = 800, innerHeight = 600, reducedMotion = false } = {}) {
  const mounted = new Set();
  const makeElement = () => {
    const el = { style: { setProperty() {} }, dataset: {}, setAttribute() {}, appendChild() {} };
    el.remove = () => mounted.delete(el);
    return el;
  };
  const doc = {
    head: { appendChild() {} },
    body: { appendChild: (el) => mounted.add(el), contains: (el) => mounted.has(el) },
    getElementById: () => null,
    createElement: makeElement,
  };
  const rafQueue = [];
  const fakeRoot = {
    innerWidth,
    innerHeight,
    document: doc,
    matchMedia: () => ({ matches: reducedMotion }),
    requestAnimationFrame: (cb) => { rafQueue.push(cb); },
  };
  let clock = 0;
  const fakePerformance = { now: () => clock };
  // `performance` and `root` are shadowed as parameter names so the IIFE's bare `performance.now()`
  // and `root.xxx` calls resolve to our fakes instead of Node's real globals.
  new Function('root', 'performance', source.replace(/\}\)\(globalThis\);\s*$/, '})(root);'))(fakeRoot, fakePerformance);
  return {
    cursor: fakeRoot.__screenreelCursor,
    now: () => clock,
    /* Advances the fake clock to `now` and fires exactly the one frame callback queued for it. */
    step(now) { clock = now; const cb = rafQueue.shift(); if (cb) cb(now); },
    /* Drains every queued frame (a tween settles once `t` reaches 1 and stops re-queueing),
       stepping the clock forward by frameMs each time. */
    run(frameMs = 16, maxFrames = 2000) {
      let frames = 0;
      while (rafQueue.length && frames++ < maxFrames) { clock += frameMs; rafQueue.shift()(clock); }
      assert(frames < maxFrames, 'cursor animation never settled — possible infinite re-queue');
    },
  };
}

/* Mirrors the private bezier math in packages/core/cursor.js so the test can compute an
   independent expectation rather than just re-running the implementation against itself. */
function expectedArcPosition(fromX, fromY, toX, toY, arcSide, t) {
  const distance = Math.hypot(toX - fromX, toY - fromY);
  const midX = (fromX + toX) / 2;
  const midY = (fromY + toY) / 2;
  const perpX = -(toY - fromY) / distance;
  const perpY = (toX - fromX) / distance;
  const jitter = 0.75 + ((Math.abs(Math.round(fromX + fromY * 7 + toX * 13 + toY * 31)) % 100) / 100) * 0.5;
  const offset = Math.min(120, distance * 0.18) * jitter * arcSide;
  const controlX = midX + perpX * offset;
  const controlY = midY + perpY * offset;
  const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const inv = 1 - eased;
  return {
    x: inv * inv * fromX + 2 * inv * eased * controlX + eased * eased * toX,
    y: inv * inv * fromY + 2 * inv * eased * controlY + eased * eased * toY,
  };
}

test('a move past the arc threshold bows away from the straight-line midpoint', () => {
  const { cursor, step } = loadCursor({ innerWidth: 800, innerHeight: 600 });
  const start = cursor.position(); // (400, 300) — centre of the fake viewport
  cursor.moveToPoint(550, 300, 400); // distance 150: past ARC_MIN_DISTANCE_PX, short of the overshoot cutoff
  step(200); // halfway through a 400ms tween
  const expected = expectedArcPosition(start.x, start.y, 550, 300, -1, 0.5); // first arc flips side to -1
  const actual = cursor.position();
  assert.ok(Math.abs(actual.x - expected.x) < 1e-6, `x: ${actual.x} vs ${expected.x}`);
  assert.ok(Math.abs(actual.y - expected.y) < 1e-6, `y: ${actual.y} vs ${expected.y}`);
  assert.notEqual(actual.y, 300, 'an arced move must leave the straight-line midpoint');
});

test('the same endpoints always produce the same curve (deterministic, no Math.random)', () => {
  const a = loadCursor();
  const b = loadCursor();
  a.cursor.moveToPoint(550, 300, 400);
  b.cursor.moveToPoint(550, 300, 400);
  for (const now of [50, 120, 200, 260, 340, 400]) { a.step(now); b.step(now); }
  assert.deepEqual(a.cursor.position(), b.cursor.position());
});

test('a move under the arc threshold stays a straight line', () => {
  const { cursor, step } = loadCursor();
  const start = cursor.position();
  cursor.moveToPoint(start.x + 20, start.y, 400); // distance 20 < ARC_MIN_DISTANCE_PX (48)
  step(200); // t = 0.5, eased = 0.5
  const pos = cursor.position();
  assert.equal(pos.x, start.x + 10);
  assert.equal(pos.y, start.y);
});

test("configure({ motion: 'line' }) forces straight travel even past the arc threshold", () => {
  const { cursor, step } = loadCursor();
  cursor.configure({ motion: 'line' });
  const start = cursor.position();
  cursor.moveToPoint(start.x + 150, start.y, 400);
  step(200);
  const pos = cursor.position();
  assert.equal(pos.x, start.x + 75);
  assert.equal(pos.y, start.y, 'line motion must not bow off the travel line');
});

test('an invalid motion value is ignored, leaving the arc default in place', () => {
  const { cursor, step } = loadCursor();
  cursor.configure({ motion: 'zigzag' });
  const start = cursor.position();
  cursor.moveToPoint(start.x + 150, start.y, 400);
  step(200);
  const pos = cursor.position();
  assert.notEqual(pos.y, start.y, 'an invalid motion must not have disabled the arc default');
});

test('successive arcs alternate which side of the travel line they bulge toward', () => {
  const { cursor, step, run, now } = loadCursor();
  const p0 = cursor.position();
  cursor.moveToPoint(p0.x + 150, p0.y, 400); // first arc
  run(); // let it fully settle before starting the next
  const p1 = cursor.position();
  assert.deepEqual(p1, { x: p0.x + 150, y: p0.y }, 'a settled arc must land exactly on its target');

  // First arc bowed toward y < p0.y at t=0.5 (see the dedicated bulge test above): its deviation
  // from the straight-line midpoint was negative. The second arc, travelling in the same
  // direction, must bow the other way — a positive deviation this time.
  const secondStart = now(); // the clock value the second tween will capture as its own `start`
  cursor.moveToPoint(p1.x + 150, p1.y, 400); // second arc, same travel direction as the first
  step(secondStart + 200); // halfway through the second 400ms tween
  const p2 = cursor.position();
  assert.notEqual(p2.y, p1.y, 'the second arc should also bow off its line');
  assert.ok(p2.y - p1.y > 0, 'the second arc must bulge opposite the first');
});

test('a long move overshoots slightly past the target and settles back onto it exactly', async () => {
  const { cursor, run } = loadCursor();
  const start = cursor.position();
  const target = { x: start.x + 500, y: start.y }; // > 200px triggers the overshoot-settle
  cursor.moveToPoint(target.x, target.y, 400);
  run(); // drains the overshoot leg
  assert.notDeepEqual(cursor.position(), target, 'should be resting past the target mid-overshoot');
  // The correction-back leg is only queued once the first tween's promise continuation runs,
  // which is a microtask — let it flush before draining the second leg.
  await Promise.resolve();
  run(); // drains the correction-back leg
  assert.deepEqual(cursor.position(), target, 'final rest position must be the exact target, not the overshoot point');
});

test('reduced motion skips arcing and overshoot, jumping straight to the target', () => {
  const { cursor } = loadCursor({ reducedMotion: true });
  const start = cursor.position();
  cursor.moveToPoint(start.x + 500, start.y, 400);
  assert.deepEqual(cursor.position(), { x: start.x + 500, y: start.y });
});
