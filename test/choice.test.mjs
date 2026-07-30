import test from 'node:test';
import assert from 'node:assert/strict';
import '../packages/core/action-runtime.js';
import '../packages/core/flow-store.js';

const { validate, validateFlowGraph, runAction, getDefinition } = globalThis.ScreenReelCore;

/* Minimal document stub: the surface countdown/choice need — element creation, class lists,
   body append/remove. */
function stubDocument() {
  const makeElement = () => {
    const element = {
      children: [], style: {}, listeners: {},
      classList: { classes: new Set(), add(name) { this.classes.add(name); }, remove(name) { this.classes.delete(name); }, contains(name) { return this.classes.has(name); } },
      appendChild(child) { this.children.push(child); return child; },
      addEventListener(type, handler) { (this.listeners[type] ??= []).push(handler); },
      removeEventListener() {},
      remove() { element.removed = true; },
      set textContent(value) { element.text = value; },
      get textContent() { return element.text; },
      set className(value) { element.cls = value; },
      get className() { return element.cls; },
    };
    return element;
  };
  const body = makeElement();
  return { doc: { createElement: () => makeElement(), body, getElementById: () => null, head: makeElement() }, body };
}

test('choice definition exists with clamped option fields', () => {
  const definition = getDefinition('choice');
  assert.equal(definition.type, 'choice');
  assert.equal(definition.category, 'Navigation');
  assert.equal(definition.picker, 'none');
});

test('validate enforces option shape and timeout/default pairing', () => {
  const base = 'https://app.test/';
  assert.deepEqual(validate({ type: 'choice', options: [{ label: 'A', scene: 's1' }] }, null, base), []);
  assert.deepEqual(validate({ type: 'choice', options: [] }, null, base), ['Provide 1-4 options']);
  assert.deepEqual(validate({ type: 'choice', options: Array.from({ length: 5 }, (_, i) => ({ label: `L${i}`, scene: `s${i}` })) }, null, base), ['Provide 1-4 options']);
  assert.deepEqual(validate({ type: 'choice', options: [{ label: '', scene: 's1' }] }, null, base), ['Every option needs a label and a scene id']);
  assert.deepEqual(validate({ type: 'choice', options: [{ label: 'A', scene: 's1' }], timeoutMs: 5000 }, null, base), ['Set a default scene when auto-continue is enabled']);
});

test('validateFlowGraph flags unknown and disabled targets, passes valid graphs', () => {
  const flow = { scenes: [
    { id: 'a', actions: [{ type: 'choice', options: [{ label: 'To B', scene: 'b' }, { label: 'Gone', scene: 'nope' }], defaultScene: 'c' }] },
    { id: 'b', actions: [] },
    { id: 'c', enabled: false, actions: [] },
  ] };
  const errors = validateFlowGraph(flow);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /unknown scene "nope"/);
  assert.match(errors[1], /disabled scene "c"/);
  assert.deepEqual(validateFlowGraph({ scenes: [{ id: 'a', actions: [{ type: 'choice', options: [{ label: 'B', scene: 'b' }] }] }, { id: 'b', actions: [] }] }), []);
});

test('runAction choice auto-picks via chooseOption and returns jumpTo', async () => {
  const { doc } = stubDocument();
  const result = await runAction(
    { type: 'choice', prompt: 'Next?', options: [{ label: 'One', scene: 's1' }, { label: 'Two', scene: 's2' }], defaultScene: 's2' },
    { document: doc, window: {}, chooseOption: (action) => action.defaultScene },
  );
  assert.deepEqual(result, { ok: true, jumpTo: 's2' });
});

test('runAction choice timeout falls back to defaultScene, or continues linearly without one', async () => {
  const { doc } = stubDocument();
  const withDefault = await runAction({ type: 'choice', options: [{ label: 'A', scene: 's1' }], timeoutMs: 5, defaultScene: 's1' }, { document: doc, window: {} });
  assert.deepEqual(withDefault, { ok: true, jumpTo: 's1' });
  const withoutDefault = await runAction({ type: 'choice', options: [{ label: 'A', scene: 's1' }], timeoutMs: 5 }, { document: doc, window: {} });
  assert.deepEqual(withoutDefault, { ok: true });
});

test('runAction choice with no usable options fails loudly', async () => {
  const { doc } = stubDocument();
  const warnings = [];
  const result = await runAction({ type: 'choice', options: [] }, { document: doc, window: {}, warn: (message) => warnings.push(message) });
  assert.equal(result.ok, false);
  assert.equal(warnings.length, 1);
});

test('duplicating a flow remaps choice targets to the copied scene ids', async () => {
  class MemoryStorage {
    constructor() { this.values = new Map(); }
    get length() { return this.values.size; }
    key(index) { return [...this.values.keys()][index] ?? null; }
    getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
    setItem(key, value) { this.values.set(key, String(value)); }
    removeItem(key) { this.values.delete(key); }
  }
  const store = await new globalThis.ScreenReelStore.Store({
    projectId: 'choice-copy', baseHref: 'https://app.test/', storage: new MemoryStorage(), sessionStorage: new MemoryStorage(),
    flow: { data: { schemaVersion: 1, flows: [{ id: 'f', name: 'F', scenes: [
      { id: 'start', route: '/', actions: [{ type: 'choice', options: [{ label: 'Go', scene: 'finale' }], defaultScene: 'finale' }] },
      { id: 'finale', route: '/', actions: [] },
    ] }] } },
  }).ready();
  const copy = store.createCopy(store.activeFlow());
  const [start, finale] = copy.scenes;
  assert.notEqual(finale.id, 'finale'); // ids really were regenerated
  assert.equal(start.actions[0].options[0].scene, finale.id);
  assert.equal(start.actions[0].defaultScene, finale.id);
  assert.deepEqual(validateFlowGraph(copy), []);
});

test('abort (pause/disable) removes the overlay and continues without a jump', async () => {
  const { doc, body } = stubDocument();
  const controller = new AbortController();
  const pending = runAction({ type: 'choice', options: [{ label: 'A', scene: 's1' }] }, { document: doc, window: {}, signal: controller.signal });
  controller.abort();
  assert.deepEqual(await pending, { ok: true });
  assert.equal(body.children[0].removed, true);
});
