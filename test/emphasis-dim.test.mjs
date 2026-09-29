import test from 'node:test';
import assert from 'node:assert/strict';
import '../packages/core/action-runtime.js';

const { runAction, setTimeScale } = globalThis.ScreenReelCore;

/* Minimal document stub for emphasis actions: element creation, a queryable set of in-view
   targets, and a record of every overlay node appended to the body. */
function stubDocument(targetCount = 1) {
  const makeElement = (rect = { left: 10, top: 10, right: 110, bottom: 60, width: 100, height: 50 }) => {
    const element = {
      style: {}, dataset: {}, removed: false, children: [], listeners: {},
      classList: { names: new Set(), add(name) { this.names.add(name); }, remove(name) { this.names.delete(name); }, contains(name) { return this.names.has(name); } },
      addEventListener(type, handler) { (element.listeners[type] ??= []).push(handler); },
      getBoundingClientRect: () => rect,
      getClientRects: () => [rect],
      appendChild(child) { element.children.push(child); appended.push(child); return child; },
      prepend(child) { element.children.unshift(child); return child; },
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
  return { doc, win: doc.defaultView, targets, backdrops, appended: () => appended };
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
  assert.equal(backdrop.style.boxShadow, '0 0 0 9999px rgba(var(--sr-dim-rgb, 9, 9, 11), 0.45)');
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

test('spotlight dims through the shared backdrop, so the presenter pill stays lit', async () => {
  const stub = stubDocument(); const appendedBoxes = [];
  const createElement = stub.doc.createElement; stub.doc.createElement = () => { const node = createElement(); appendedBoxes.push(node); return node; };
  await run({ type: 'spotlight', selector: '.kpi', holdMs: 100 }, stub, { dim: false });
  const [backdrop] = stub.backdrops();
  assert.match(backdrop.style.boxShadow, /0\.62\)/, 'spotlight keeps its stronger default and ignores the host highlight dim');
  const ring = appendedBoxes.find((node) => node.className === 'sr-action-box');
  assert.equal(ring.style.boxShadow, undefined, 'the ring carries no spread shadow of its own');
  assert.equal(backdrop.removed && ring.removed, true);
});

test('the dim backdrop is layered below the projector shell', async () => {
  const stub = stubDocument(); let css = '';
  stub.doc.head.prepend = (node) => { css = node.textContent; return node; };
  await run({ type: 'highlight', selector: '.kpi', holdMs: 100 }, stub);
  const backdropZ = Number(/\.sr-dim-backdrop\{[^}]*z-index:(\d+)/.exec(css)[1]);
  const shellCss = (await import('node:fs')).readFileSync(new URL('../packages/projector/screenreel.css', import.meta.url), 'utf8');
  const shellZ = Number(/\.sr-shell\{[^}]*z-index:(\d+)/.exec(shellCss)[1]);
  assert.ok(backdropZ < shellZ, `backdrop z ${backdropZ} must sit under the shell z ${shellZ}`);
});

const byClass = (stub, className) => stub.appended().filter((node) => node.className === className);

test('callout renders an optional title as its own heading and the text as its body', async () => {
  const stub = stubDocument();
  await run({ type: 'callout', selector: '.kpi', title: 'Sidebar', text: 'Every page lives here', holdMs: 100 }, stub);
  const [tip] = byClass(stub, 'sr-action-callout');
  assert.deepEqual(tip.children.map((node) => [node.className, node.textContent]), [['sr-callout-title', 'Sidebar'], ['sr-callout-body', 'Every page lives here']]);
  assert.equal(tip.dataset.side, 'bottom');
});

test('callout highlight: true rings the target together with the callout', async () => {
  const stub = stubDocument();
  await run({ type: 'callout', selector: '.kpi', text: 'Look', highlight: true, holdMs: 100 }, stub);
  const [ring] = byClass(stub, 'sr-glow-box');
  assert.ok(ring, 'a ring is drawn'); assert.equal(ring.removed, true);
});

test('keep: untilSceneEnd and persist hand overlays to the host instead of removing them', async () => {
  for (const [action, extra] of [[{ type: 'highlight', keep: 'untilSceneEnd' }, {}], [{ type: 'callout', text: 'Hi' }, { persist: true }], [{ type: 'spotlight' }, { persist: true }]]) {
    const stub = stubDocument(); const releases = [];
    await run({ ...action, selector: '.kpi', holdMs: 100 }, stub, { ...extra, retain: (release) => releases.push(release) });
    assert.equal(releases.length, 1, action.type);
    assert.equal(stub.backdrops()[0].removed, false, `${action.type} stays up until released`);
    releases[0]();
    assert.equal(stub.backdrops()[0].removed, true, `${action.type} released`);
  }
});

test('an interrupted persisting action cleans up at once rather than handing overlays over', async () => {
  const stub = stubDocument(); const controller = new AbortController(); const releases = [];
  const pending = run({ type: 'callout', selector: '.kpi', text: 'Hi', holdMs: 100000 }, stub, { persist: true, retain: (release) => releases.push(release), signal: controller.signal });
  controller.abort(); await pending;
  assert.equal(releases.length, 0); assert.equal(stub.backdrops()[0].removed, true);
});

test('a persisting callout shows Back and Next controls wired to the host', async () => {
  const stub = stubDocument(); const calls = [];
  const calloutControls = { labels: { back: 'Back', next: 'Next' }, onBack: () => calls.push('back'), onNext: () => calls.push('next') };
  await run({ type: 'callout', selector: '.kpi', text: 'Hi', holdMs: 100 }, stub, { persist: true, retain: () => {}, calloutControls });
  const [tip] = byClass(stub, 'sr-action-callout');
  const bar = tip.children.find((node) => node.className === 'sr-callout-actions');
  assert.deepEqual(bar.children.map((button) => button.textContent), ['Back', 'Next']);
  bar.children.forEach((button) => button.listeners.click[0]());
  assert.deepEqual(calls, ['back', 'next']);
  assert.ok(tip.classList.contains('sr-callout--interactive'));
});
