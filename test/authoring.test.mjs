import test from 'node:test';
import assert from 'node:assert/strict';
import '../packages/core/action-runtime.js';
import '../packages/core/flow-store.js';
import { cardFieldsFor, CARD_TITLE_PREFILL_CHARS } from '../packages/studio/recorder.js';

const { inverseFor, pairedUndo, cardReadingMs, cardHoldMs, isGuidedStep, infoCardStep, getDefinition, validate } = globalThis.ScreenReelCore;
const { Store, normalizeFlow } = globalThis.ScreenReelStore;

test('inverseFor restores form controls as plain set/toggle actions and leaves other actions alone', () => {
  assert.deepEqual(inverseFor({ type: 'type', selector: '#name', text: 'New' }, { value: 'Old' }), { type: 'set', selector: '#name', value: 'Old' });
  assert.deepEqual(inverseFor({ type: 'fill', selector: '#name', index: 2 }, { value: '' }), { type: 'set', selector: '#name', index: 2, value: '' });
  assert.deepEqual(inverseFor({ type: 'set', selector: '#aud' }, { value: 'eng' }), { type: 'set', selector: '#aud', value: 'eng' });
  assert.deepEqual(inverseFor({ type: 'lever', selector: '#pace', to: 3 }, { value: '2' }), { type: 'set', selector: '#pace', value: '2' });
  assert.deepEqual(inverseFor({ type: 'toggle', selector: '#notes', checked: true }, { checked: false }), { type: 'toggle', selector: '#notes', checked: false });
  for (const type of ['click', 'highlight', 'callout', 'goto', 'scroll']) assert.equal(inverseFor({ type, selector: '#x' }, {}), null, type);
});

test('pairedUndo finds the later click on the same element, and only that', () => {
  const actions = [
    { type: 'click', selector: '#theme' },
    { type: 'callout', selector: '#theme', text: 'Dark mode' },
    { type: 'click', selector: '#other' },
    { type: 'click', selector: '#theme' },
  ];
  assert.equal(pairedUndo(actions, 0), 3);
  assert.equal(pairedUndo(actions, 2), -1, 'a click with no later twin has no undo');
  assert.equal(pairedUndo(actions, 1), -1, 'only clicks pair');
  assert.equal(pairedUndo([{ type: 'click', selector: '.row', index: 0 }, { type: 'click', selector: '.row', index: 1 }], 0), -1, 'a different match index is a different element');
});

test('an info card never leaves before it can be read', () => {
  const words = (count) => Array.from({ length: count }, (_, index) => `w${index}`).join(' ');
  assert.equal(cardReadingMs({}), 0);
  assert.equal(cardHoldMs({ holdMs: 2200, text: 'Short' }), 2200, 'a short card keeps its own time');
  const long = { holdMs: 2200, title: 'A title here', text: words(20) };
  assert.equal(cardHoldMs(long), cardReadingMs(long));
  assert.ok(cardReadingMs(long) > 2200);
});

test('info cards are the guided steps, counted across enabled scenes in order', () => {
  assert.equal(isGuidedStep({ type: 'callout' }), true);
  assert.equal(isGuidedStep({ type: 'highlight' }), false);
  const scenes = [
    { id: 'a', actions: [{ type: 'callout' }, { type: 'click' }, { type: 'callout' }] },
    { id: 'b', actions: [{ type: 'highlight' }, { type: 'callout' }] },
  ];
  assert.deepEqual(infoCardStep(scenes, 'a', 2), { step: 2, total: 3 });
  assert.deepEqual(infoCardStep(scenes, 'b', 1), { step: 3, total: 3 });
  assert.deepEqual(infoCardStep(scenes, 'b', 0), { step: 0, total: 3 });
});

test('the Info card definition leads the catalog and an empty card does not validate', () => {
  const definition = getDefinition('callout');
  assert.equal(definition.label, 'Info card');
  assert.equal(definition.category, 'Explain');
  assert.equal(globalThis.ScreenReelCore.definitions[0].id, 'callout');
  assert.equal(definition.defaults.highlight, true);
  assert.ok(validate({ type: 'callout', selector: '#x', text: '  ' }, null, 'https://app.test/').includes('Give this info card some text'));
  assert.ok(!validate({ type: 'callout', selector: '#x', text: 'Hi' }, null, 'https://app.test/').includes('Give this info card some text'));
});

test('a captured info card is titled from its element text, trimmed and capped', () => {
  assert.deepEqual(cardFieldsFor('highlight', { text: 'Save' }), {});
  assert.deepEqual(cardFieldsFor('callout', { text: '  Save\n changes ' }), { title: 'Save changes' });
  assert.deepEqual(cardFieldsFor('callout', {}), {});
  assert.equal(cardFieldsFor('callout', { text: 'x'.repeat(200) }).title.length, CARD_TITLE_PREFILL_CHARS);
});

class MemoryStorage {
  constructor() { this.values = new Map(); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test('a new flow lets viewers choose; flows that declare nothing keep playing auto', () => {
  const store = new Store({ projectId: 'authoring-test', flow: { data: { schemaVersion: 1, flows: [] } }, baseHref: 'https://app.test/', storage: new MemoryStorage(), session: new MemoryStorage() });
  assert.equal(store.createBlank('Onboarding').defaults.advance, 'ask');
  assert.equal(normalizeFlow({ id: 'legacy', name: 'Legacy', scenes: [] }, 0, 'https://app.test/').defaults.advance, undefined);
});

test('scene cleanup survives normalisation with ids that cannot collide with action ids', () => {
  const flow = normalizeFlow({ id: 'f', name: 'F', defaults: { advance: 'guided' }, scenes: [{ id: 's', route: '/', actions: [{ type: 'click', selector: '#a' }], cleanup: [{ type: 'click', selector: '#a' }] }] }, 0, 'https://app.test/');
  assert.equal(flow.defaults.advance, 'guided');
  const [scene] = flow.scenes;
  assert.equal(scene.cleanup.length, 1);
  assert.notEqual(scene.cleanup[0].id, scene.actions[0].id);
});
