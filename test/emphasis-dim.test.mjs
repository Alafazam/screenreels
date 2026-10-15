import test from 'node:test';
import assert from 'node:assert/strict';
import '../packages/core/action-runtime.js';

const { runAction, setTimeScale } = globalThis.ScreenReelCore;

/* Minimal document stub for emphasis actions: element creation, a queryable set of in-view
   targets, and a record of every overlay node appended to the body. */
function stubDocument(targetCount = 1) {
  const makeElement = (rect = { left: 10, top: 200, right: 110, bottom: 250, width: 100, height: 50 }) => {
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
  const targets = Array.from({ length: targetCount }, (_, index) => makeElement({ left: 10 + index * 200, top: 200, right: 110 + index * 200, bottom: 250, width: 100, height: 50 }));
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

test('ctx.noDim (a timed step with actions) removes every dim, even an action\'s own, spotlight\'s included', async () => {
  for (const action of [
    { type: 'highlight', selector: '.kpi', holdMs: 100, dim: 0.7 },
    { type: 'callout', selector: '.kpi', text: 'Look here', holdMs: 100, highlight: true, dim: 0.7 },
    { type: 'spotlight', selector: '.kpi', holdMs: 100 },
  ]) {
    const stub = stubDocument();
    const result = await run(action, stub, { noDim: true });
    assert.equal(result.ok, true);
    assert.equal(stub.backdrops().length, 0, `${action.type} adds no dim`);
    assert.ok(stub.appended().length > 0, `${action.type} still draws its ring or card`);
  }
});

test('a card overlapping an element an action works on fades, and comes back when it no longer does', async () => {
  const stub = stubDocument(); const card = []; const createElement = stub.doc.createElement;
  stub.doc.createElement = () => { const node = createElement(); card.push(node); return node; };
  let working = [{ getBoundingClientRect: () => ({ left: 0, top: 0, right: 5000, bottom: 5000, width: 5000, height: 5000 }), isConnected: true }];
  const win = { ...stub.win, requestAnimationFrame: (fn) => setTimeout(fn, 5), cancelAnimationFrame: (id) => clearTimeout(id) };
  const tip = () => card.find((node) => node.className === 'sr-action-callout');
  let release = () => {}; // a timed card persists until its step ends, like the projector's
  const running = runAction({ type: 'callout', selector: '.kpi', text: 'Look here' }, { document: stub.doc, window: win, actionTargets: () => working, persist: true, skipHold: true, retain: (fn) => { release = fn; } });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(tip().style.opacity, '0.35', 'covering an action target fades the card');
  working = [];
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(tip().style.opacity, '', 'and it returns to full strength');
  await running; release();
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
  await new Promise((resolve) => setTimeout(resolve, 0)); // the card is up and holding
  assert.equal(stub.backdrops().length, 1);
  controller.abort(); await pending;
  assert.equal(releases.length, 0); assert.equal(stub.backdrops()[0].removed, true);
});

test('an action interrupted before its overlays show draws none (an exit while it scrolls into view)', async () => {
  const stub = stubDocument(); const controller = new AbortController();
  const pending = run({ type: 'callout', selector: '.kpi', text: 'Hi', holdMs: 100000 }, stub, { persist: true, retain: () => {}, signal: controller.signal });
  controller.abort(); const result = await pending;
  assert.deepEqual(result, { ok: false, error: 'aborted' });
  assert.equal(stub.backdrops().length, 0); assert.equal(byClass(stub, 'sr-action-callout').length, 0);
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

test('an element hugging the bottom edge is scrolled into the comfort band before it is emphasised', async () => {
  const stub = stubDocument(); const [target] = stub.targets; const scrolls = [];
  target.getBoundingClientRect = () => ({ left: 10, top: 660, right: 110, bottom: 710, width: 100, height: 50 });
  target.scrollIntoView = (options) => scrolls.push(options.block);
  await run({ type: 'highlight', selector: '.kpi', holdMs: 100 }, stub);
  assert.deepEqual(scrolls, ['center'], 'on screen but in the bottom 20% still scrolls');
});

test('the projector shell sits above every overlay the runtime draws, so no ring, ripple or card cuts the pill', async () => {
  const stub = stubDocument(); let css = '';
  stub.doc.head.prepend = (node) => { css = node.textContent; return node; };
  await run({ type: 'highlight', selector: '.kpi', holdMs: 100 }, stub);
  const overlayZ = [...css.matchAll(/z-index:(\d+)/g)].map((match) => Number(match[1]));
  const shellCss = (await import('node:fs')).readFileSync(new URL('../packages/projector/screenreel.css', import.meta.url), 'utf8');
  const shellZ = Number(/\.sr-shell\{[^}]*z-index:(\d+)/.exec(shellCss)[1]);
  assert.ok(overlayZ.length > 3, 'the runtime styles were read');
  assert.ok(overlayZ.every((z) => z < shellZ), `every overlay z (${Math.max(...overlayZ)} at most) must sit under the shell z ${shellZ}`);
});

test('a card follows its target when the host replaces it, and stays put when nothing replaces it', async () => {
  const stub = stubDocument(); const created = []; const createElement = stub.doc.createElement;
  stub.doc.createElement = () => { const node = createElement(); created.push(node); return node; };
  const [first] = stub.targets; first.isConnected = true;
  const replacement = { isConnected: true, getBoundingClientRect: () => ({ left: 600, top: 300, right: 700, bottom: 340, width: 100, height: 40 }), getClientRects: () => [1] };
  let found = [first]; stub.doc.querySelectorAll = () => found;
  const win = { ...stub.win, requestAnimationFrame: (fn) => setTimeout(fn, 5), cancelAnimationFrame: (id) => clearTimeout(id) };
  const tip = () => created.find((node) => node.className === 'sr-action-callout');
  const ring = () => created.find((node) => node.className === 'sr-glow-box');
  let release = () => {};
  const running = runAction({ type: 'callout', selector: '.kpi', text: 'Here', placement: 'bottom', highlight: true }, { document: stub.doc, window: win, persist: true, skipHold: true, retain: (fn) => { release = fn; } });
  try {
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(tip().style.left, '10px', 'placed under the first target');
    first.isConnected = false; found = [replacement];
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepEqual([tip().style.left, ring().style.left], ['600px', '595px'], 'card and ring move to the replacement');
    replacement.isConnected = false; found = [];
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(tip().style.left, '600px', 'with no replacement the card stays where it was, not in the corner');
  } finally { await running; release(); } // stops the follow loop, which would otherwise keep the test alive
});

test('a click lands on the replacement when the host re-renders its target during the cursor move, and on nothing when there is none', async () => {
  for (const replaced of [true, false]) {
    const stub = stubDocument(); const warnings = []; const clicks = [];
    const [first] = stub.targets; first.isConnected = true; first.click = () => clicks.push('detached');
    const replacement = { ...stubDocument().targets[0], isConnected: true, click: () => clicks.push('replacement') };
    let found = [first]; stub.doc.querySelectorAll = () => found;
    const moveCursor = async () => { first.isConnected = false; found = replaced ? [replacement] : []; };
    const result = await run({ type: 'click', selector: '.menu a' }, stub, { moveCursor, warn: (message) => warnings.push(message) });
    if (replaced) assert.deepEqual([result.ok, clicks], [true, ['replacement']]);
    else {
      assert.deepEqual([result.ok, clicks], [false, []], 'a detached element is never clicked');
      assert.match(warnings[0], /Selector not found: \.menu a/);
    }
  }
});

test('a card, ring and dim stay put when their target is still on the page but hidden (0x0)', async () => {
  const stub = stubDocument(); const created = []; const createElement = stub.doc.createElement;
  stub.doc.createElement = () => { const node = createElement(); created.push(node); return node; };
  const [target] = stub.targets; target.isConnected = true;
  let rect = { left: 600, top: 300, right: 700, bottom: 340, width: 100, height: 40 };
  target.getBoundingClientRect = () => rect;
  const win = { ...stub.win, requestAnimationFrame: (fn) => setTimeout(fn, 5), cancelAnimationFrame: (id) => clearTimeout(id) };
  const find = (className) => created.find((node) => node.className === className);
  const where = () => ['sr-action-callout', 'sr-glow-box', 'sr-dim-backdrop'].map((className) => [find(className).style.left, find(className).style.top]);
  let release = () => {};
  const running = runAction({ type: 'callout', selector: '.kpi', text: 'Here', placement: 'bottom', highlight: true }, { document: stub.doc, window: win, persist: true, skipHold: true, retain: (fn) => { release = fn; } });
  try {
    await new Promise((resolve) => setTimeout(resolve, 20));
    const placed = where();
    assert.deepEqual(placed.map(([left]) => left), ['600px', '595px', '595px'], 'card, ring and dim are placed on the target');
    rect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; // collapsed by the step's click
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepEqual(where(), placed, 'a hidden target leaves everything where it was, not in the corner');
  } finally { await running; release(); }
});
