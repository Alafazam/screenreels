import test from 'node:test';
import assert from 'node:assert/strict';
import '../packages/core/action-runtime.js';

const { placeCallout } = globalThis.ScreenReelCore;

const viewport = { width: 1280, height: 900 };
const size = { width: 280, height: 120 };
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const onScreen = ({ left, top }) => left >= 0 && top >= 0 && left + size.width <= viewport.width && top + size.height <= viewport.height;

test('bottom placement sits under the target, aligned to its left edge', () => {
  assert.deepEqual(placeCallout(rect(100, 100, 200, 40), size, viewport, 'bottom'), { left: 100, top: 148, side: 'bottom' });
});

test('left and right centre vertically on the target', () => {
  const target = rect(500, 300, 200, 200);
  assert.deepEqual(placeCallout(target, size, viewport, 'right'), { left: 708, top: 340, side: 'right' });
  assert.deepEqual(placeCallout(target, size, viewport, 'left'), { left: 212, top: 340, side: 'left' });
});

test('a full-height sidebar with placement right lands beside it and on screen (ms-ui measured top: 828px)', () => {
  const sidebar = rect(0, 64, 240, 836);
  const placed = placeCallout(sidebar, size, viewport, 'right');
  assert.equal(placed.side, 'right');
  assert.equal(placed.left, 248);
  assert.ok(onScreen(placed), JSON.stringify(placed));
});

test('a target filling 90% of the viewport height with no room above or below goes to the roomiest side', () => {
  const tall = rect(40, 45, 300, 810);
  for (const placement of ['auto', 'bottom', 'top']) {
    const placed = placeCallout(tall, size, viewport, placement);
    assert.equal(placed.side, 'right', placement);
    assert.ok(onScreen(placed), `${placement}: ${JSON.stringify(placed)}`);
  }
});

test('a target within 40px of the bottom edge flips its bottom callout to the top', () => {
  const footer = rect(20, 820, 200, 40);
  const placed = placeCallout(footer, size, viewport, 'bottom');
  assert.equal(placed.side, 'top');
  assert.equal(placed.top, 820 - 8 - size.height);
  assert.ok(onScreen(placed));
  assert.equal(placeCallout(footer, size, viewport, 'auto').side, 'top');
});

test('a right callout at the right edge flips left; results are always clamped inside the viewport', () => {
  const edge = rect(1100, 400, 150, 40);
  assert.equal(placeCallout(edge, size, viewport, 'right').side, 'left');
  const offscreen = placeCallout(rect(-500, -500, 50, 50), size, viewport, 'bottom');
  assert.ok(onScreen(offscreen), JSON.stringify(offscreen));
});
