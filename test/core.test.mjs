import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import '../packages/core/action-runtime.js';
import '../packages/core/flow-store.js';
import { loadScenes } from '../lib/config.mjs';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test('registry exposes 20 catalog entries, recipes, and legacy aliases', () => {
  assert.equal(ScreenReelCore.definitions.length, 20); assert.equal(ScreenReelCore.recipes.length, 6); assert.equal(ScreenReelCore.actionType({ type: 'fill' }), 'type'); assert(ScreenReelCore.supportedTypes.has('glow'));
});
test('route normalization preserves functional query and rejects external routes', () => {
  assert.equal(ScreenReelCore.normalizeRoute('/orders?task=review&demo=1', 'https://app.test/home'), '/orders?task=review');
  assert.equal(ScreenReelCore.normalizeRoute('https://evil.test/x', 'https://app.test/home'), null); assert.equal(ScreenReelCore.normalizeRoute('../secret', 'https://app.test/home'), null);
});
test('normalizes Increff steps, CLI scenes, and canonical manifests', () => {
  const legacy = ScreenReelStore.normalizeManifest({ name: 'Legacy', steps: [{ id: 'one', route: '/one', caption: { title: 'One', body: 'Talk' }, actions: [] }] }, 'https://app.test/');
  assert.equal(legacy.flows[0].scenes[0].talkingPoints, 'Talk');
  const cli = ScreenReelStore.normalizeManifest({ scenes: [{ id: 'two', route: '/two', actions: [{ type: 'fill', selector: '#x', value: 'A' }] }] }, 'https://app.test/');
  assert.equal(cli.flows[0].scenes[0].actions[0].type, 'fill');
  const canonical = ScreenReelStore.normalizeManifest({ schemaVersion: 1, flows: [{ id: 'f', name: 'Flow', scenes: [] }] }, 'https://app.test/'); assert.equal(canonical.flows[0].id, 'f');
});
test('project namespaces isolate local data and clear only their own keys', async () => {
  const local = new MemoryStorage(); const session = new MemoryStorage(); const source = { data: { schemaVersion: 1, flows: [{ id: 'standard', name: 'Standard', scenes: [] }] } };
  const a = await new ScreenReelStore.Store({ projectId: 'project-a', flow: source, storage: local, sessionStorage: session, baseHref: 'https://app.test/' }).ready();
  const b = await new ScreenReelStore.Store({ projectId: 'project-b', flow: source, storage: local, sessionStorage: session, baseHref: 'https://app.test/' }).ready();
  a.save(a.createBlank('A')); b.save(b.createBlank('B')); a.clearAll(); assert.equal(a.readLocal().length, 0); assert.equal(b.readLocal().length, 1);
});
test('legacy storage is copied once without deleting source keys', async () => {
  const local = new MemoryStorage(); const session = new MemoryStorage(); local.setItem('old_flows', JSON.stringify({ schemaVersion: 1, flows: [] })); local.setItem('old_enabled', '1'); session.setItem('old_position', '3');
  const store = await new ScreenReelStore.Store({ projectId: 'migration-test', flow: { data: { schemaVersion: 1, flows: [{ id: 'standard', name: 'Standard', scenes: [] }] } }, storage: local, sessionStorage: session, baseHref: 'https://app.test/', legacyStorage: { id: 'old-v1', flowsKey: 'old_flows', enabledKey: 'old_enabled', session: { positionKey: 'old_position' } } }).ready();
  assert.equal(store.enabled(), true); assert.equal(store.position(), 3); assert.equal(local.getItem('old_enabled'), '1'); assert.equal(local.getItem(store.key('migration')), 'old-v1');
});
test('capture loader accepts canonical flows', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'screenreel-test-')); const file = path.join(directory, 'flow.json');
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, flows: [{ id: 'f', name: 'Flow', scenes: [{ id: 'scene', route: '/example', actions: [] }] }] }));
  const scenes = loadScenes({ scenes: file }); assert.equal(scenes.length, 1); assert.equal(scenes[0].id, 'scene');
});
test('the Action Showcase covers every catalog action definition', () => {
  const document = JSON.parse(fs.readFileSync(new URL('../examples/action-showcase/screenreel.demo.json', import.meta.url), 'utf8'));
  const actions = document.flows.flatMap((flow) => flow.scenes).flatMap((scene) => scene.actions);
  const covered = new Set(actions.map((action) => ScreenReelCore.definitionForAction(action)?.id).filter(Boolean));
  assert.deepEqual([...covered].sort(), ScreenReelCore.definitions.map((item) => item.id).sort());
});
