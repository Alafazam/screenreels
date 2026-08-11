import test from 'node:test';
import assert from 'node:assert/strict';
import '../packages/core/action-runtime.js';
import '../packages/core/flow-store.js';

const { interpolate, variableDefaults, resolveActionVariables, runAction } = globalThis.ScreenReelCore;

test('interpolate substitutes declared names, tolerates whitespace, leaves unknowns literal', () => {
  const variables = { company: 'Acme', region: 'West' };
  assert.equal(interpolate('Hello {{company}} of {{ region }}', variables).value, 'Hello Acme of West');
  const unknown = interpolate('Hi {{nobody}}', variables);
  assert.equal(unknown.value, 'Hi {{nobody}}');
  assert.deepEqual(unknown.missing, ['nobody']);
  // Non-strings and brace-less strings pass through untouched on the fast path.
  assert.equal(interpolate(42, variables).value, 42);
  assert.equal(interpolate('plain', variables).value, 'plain');
});

test('interpolation is single-pass: substituted values are never re-expanded', () => {
  const { value } = interpolate('{{a}}', { a: '{{b}}', b: 'nested' });
  assert.equal(value, '{{b}}');
});

test('variableDefaults accepts string shorthand and object form, rejecting invalid names', () => {
  assert.deepEqual(variableDefaults({ company: 'Acme', region: { label: 'Region', default: 'West' }, 'bad-name': 'x', empty: {} }), { company: 'Acme', region: 'West', empty: '' });
  assert.deepEqual(variableDefaults(undefined), {});
});

test('resolveActionVariables interpolates only the display/value allowlist — never selectors', () => {
  const action = { type: 'type', selector: '#field-{{company}}', toSelector: '{{company}}', cursorTo: '{{company}}', fn: '{{company}}', url: '/x?q={{company}}', text: 'Hi {{company}}', note: 'For {{company}}', value: '{{company}}', label: '{{company}}', code: '{{company}}', caption: '{{company}}', goText: '{{company}}', narration: 'Now {{company}} sees this' };
  const resolved = resolveActionVariables(action, { company: 'Acme' });
  assert.equal(resolved.text, 'Hi Acme');
  assert.equal(resolved.note, 'For Acme');
  assert.equal(resolved.value, 'Acme');
  assert.equal(resolved.label, 'Acme');
  assert.equal(resolved.code, 'Acme');
  assert.equal(resolved.caption, 'Acme');
  assert.equal(resolved.goText, 'Acme');
  assert.equal(resolved.narration, 'Now Acme sees this');
  // Security-relevant fields stay byte-identical.
  assert.equal(resolved.selector, '#field-{{company}}');
  assert.equal(resolved.toSelector, '{{company}}');
  assert.equal(resolved.cursorTo, '{{company}}');
  assert.equal(resolved.fn, '{{company}}');
  assert.equal(resolved.url, '/x?q={{company}}');
});

test('resolveActionVariables warns once per action about unresolved names', () => {
  const warnings = [];
  resolveActionVariables({ text: '{{a}} {{b}} {{a}}', note: '{{b}}' }, { known: 'x' }, (message) => warnings.push(message));
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /a, b/);
});

test('runAction interpolates the announced note inside the executor', async () => {
  const announced = [];
  const result = await runAction({ type: 'wait', ms: 1, note: 'Welcome, {{company}}' }, {
    document: {}, window: {}, variables: { company: 'Acme' }, announce: (message) => announced.push(message),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(announced, ['Welcome, Acme']);
});

/* An action's narration is spoken by the executor as the action starts, so a personalized share
   link is HEARD saying the prospect's name. Blank lines must never reach the speech engine. */
test('runAction speaks an action narration through narrateAction, interpolated and never blank', async () => {
  const spoken = [];
  const narrateAction = (text) => spoken.push(text);
  await runAction({ type: 'wait', ms: 1, narration: '  Here is {{company}} revenue.  ' }, { document: {}, window: {}, variables: { company: 'Acme' }, narrateAction });
  await runAction({ type: 'wait', ms: 1, narration: '   ' }, { document: {}, window: {}, narrateAction });
  await runAction({ type: 'wait', ms: 1 }, { document: {}, window: {}, narrateAction });
  assert.deepEqual(spoken, ['Here is Acme revenue.']);
});

test('share-link srv_ params never affect route matching', () => {
  const { normalizeRoute } = globalThis.ScreenReelCore;
  assert.equal(normalizeRoute('/tour?demo=play&srv_company=Acme&task=review', 'https://app.test/'), '/tour?task=review');
  assert.equal(normalizeRoute('/tour?srv_a=1&srv_b=2', 'https://app.test/'), '/tour');
});

test('flows with variables round-trip through the store and session values persist per run', async () => {
  class MemoryStorage {
    constructor() { this.values = new Map(); }
    get length() { return this.values.size; }
    key(index) { return [...this.values.keys()][index] ?? null; }
    getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
    setItem(key, value) { this.values.set(key, String(value)); }
    removeItem(key) { this.values.delete(key); }
  }
  const store = new globalThis.ScreenReelStore.Store({
    projectId: 'vars-test', baseHref: 'https://app.test/',
    storage: new MemoryStorage(), sessionStorage: new MemoryStorage(),
    flow: { data: { schemaVersion: 1, flows: [{ id: 'f', name: 'F', variables: { company: 'Acme' }, scenes: [{ id: 's', route: '/', actions: [] }] }] } },
  });
  await store.ready();
  assert.deepEqual(store.activeFlow().variables, { company: 'Acme' });
  assert.deepEqual(store.export(store.activeFlow()).flows[0].variables, { company: 'Acme' });
  store.setVariables({ company: 'Umbrella' });
  assert.deepEqual(store.variables(), { company: 'Umbrella' });
  store.clearRun();
  assert.deepEqual(store.variables(), {});
});
