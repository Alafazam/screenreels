import test from 'node:test';
import assert from 'node:assert/strict';
import '../packages/core/action-runtime.js';

const { runAction, setTimeScale } = globalThis.ScreenReelCore;

/* Minimal document stub for emphasis actions: element creation, a queryable set of in-view
   targets, and a record of every overlay node appended to the body. */
function stubDocument(targetCount = 1) {
  const makeElement = (rect = { left: 10, top: 10, right: 110, bottom: 60, width: 100, height: 50 }) => {
    const element = {
      style: {}, removed: false,
      classList: { add() {}, remove() {} },
      getBoundingClientRect: () => rect,
      getClientRects: () => [rect],
      appendChild(child) { appended.push(child); return child; },
      remove() { element.removed = true; },
    };
    return element;
  };
  const appended = [];
  const targets = Array.from({ length: targetCount }, (_, index) => makeElement({ left: 10 + index * 200, top: 10, right: 110 + index * 200, bottom: 60, width: 100, height: 50 }));
  const doc = {
    body: makeElement(), head: makeElement(),
    createElement: () => makeElement(),
    getElementById: () => null,
    querySelectorAll: () => targets,
  };
  doc.defaultView = { innerWidth: 1280, innerHeight: 720, getComputedStyle: () => ({ display: 'block', visibility: 'visible' }), document: doc };
  const backdrops = () => appended.filter((node) => node.className === 'sr-dim-backdrop');
  return { doc, win: doc.defaultView, targets, backdrops };
}

const run = (action, stub, extra = {}) => runAction(action, { document: stub.doc, window: stub.win, ...extra });

test.before(() => setTimeScale(0.01));
test.after(() => setTimeScale(1));

test('highlight dims the rest of the page by default and un-dims when it ends', async () => {
  const stub = stubDocument();
  const result = await run({ type: 'highlight', selector: '.kpi', holdMs: 100 }, stub);
  assert.equal(result.ok, true);
  const [backdrop] = stub.backdrops();
  assert.equal(stub.backdrops().length, 1);
  assert.match(backdrop.style.boxShadow, /rgba\(9,9,11,0\.45\)/);
  assert.equal(backdrop.style.left, '5px', 'the cut-out is placed on the target, not the corner');
  assert.equal(backdrop.removed, true);
});

test('an action dim overrides the host default; 0 and false turn dimming off', async () => {
  const custom = stubDocument();
  await run({ type: 'highlight', selector: '.kpi', holdMs: 100, dim: 0.7 }, custom, { dim: 0.2 });
  assert.match(custom.backdrops()[0].style.boxShadow, /0\.7\)/);

  const hostDefault = stubDocument();
  await run({ type: 'highlight', selector: '.kpi', holdMs: 100 }, hostDefault, { dim: 0.2 });
  assert.match(hostDefault.backdrops()[0].style.boxShadow, /0\.2\)/);

  const actionOff = stubDocument();
  await run({ type: 'highlight', selector: '.kpi', holdMs: 100, dim: 0 }, actionOff);
  assert.equal(actionOff.backdrops().length, 0);

  const hostOff = stubDocument();
  await run({ type: 'highlight', selector: '.kpi', holdMs: 100 }, hostOff, { dim: false });
  assert.equal(hostOff.backdrops().length, 0);
});

test('a highlight sequence moves one backdrop across every target', async () => {
  const stub = stubDocument(3);
  await run({ type: 'glow', selector: '.kpi', sequence: true, count: 3, stepMs: 100 }, stub);
  const backdrops = stub.backdrops();
  assert.equal(backdrops.length, 1);
  assert.equal(backdrops[0].style.left, '405px', 'the backdrop ends on the last target');
  assert.equal(backdrops[0].removed, true);
});

test('kept highlights keep the ring but release the dim immediately', async () => {
  const stub = stubDocument();
  await run({ type: 'highlight', selector: '.kpi', holdMs: 100, keep: true, keepMs: 100 }, stub);
  assert.equal(stub.backdrops()[0].removed, true);
});

test('callout dims around its target', async () => {
  const stub = stubDocument();
  await run({ type: 'callout', selector: '.kpi', text: 'Look here', holdMs: 100 }, stub);
  assert.equal(stub.backdrops().length, 1);
  assert.equal(stub.backdrops()[0].removed, true);
});

test('an invalid dim warns and falls back to the default', async () => {
  const stub = stubDocument(); const warnings = [];
  await run({ type: 'highlight', selector: '.kpi', holdMs: 100, dim: 'dark' }, stub, { warn: (message) => warnings.push(message) });
  assert.deepEqual(warnings, ['Invalid dim value: dark']);
  assert.match(stub.backdrops()[0].style.boxShadow, /0\.45\)/);
});
