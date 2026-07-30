import test from 'node:test';
import assert from 'node:assert/strict';
import '../packages/core/action-runtime.js';
import '../packages/core/flow-store.js';
import { createAnalytics } from '../packages/projector/analytics.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

async function makeStore(sceneCount = 3, session = new MemoryStorage()) {
  const scenes = Array.from({ length: sceneCount }, (_, index) => ({ id: `s${index + 1}`, route: '/', actions: [] }));
  const store = new globalThis.ScreenReelStore.Store({
    projectId: 'analytics-test', baseHref: 'https://app.test/',
    storage: new MemoryStorage(), sessionStorage: session,
    flow: { data: { schemaVersion: 1, flows: [{ id: 'f', name: 'F', scenes }] } },
  });
  await store.ready();
  return store;
}

test('events are enriched with session, flow, scene, and funnel fields', async () => {
  const store = await makeStore(4);
  store.setPosition(1);
  const dispatched = [];
  const received = [];
  const analytics = createAnalytics({ store, options: { onEvent: (event) => received.push(event) }, dispatch: (name, detail) => dispatched.push({ name, detail }) });
  const payload = analytics.emit('scene_enter');
  assert.equal(payload.event, 'scene_enter');
  assert.equal(payload.projectId, 'analytics-test');
  assert.equal(payload.flowId, 'f');
  assert.equal(payload.sceneId, 's2');
  assert.equal(payload.sceneIndex, 1);
  assert.equal(payload.sceneCount, 4);
  assert.equal(payload.percentComplete, 50);
  assert.equal(payload.share, false);
  assert(typeof payload.sessionId === 'string' && payload.sessionId.length > 8);
  assert.equal(dispatched[0].name, 'analytics');
  assert.deepEqual(received[0], payload);
});

test('session id is stable across analytics instances sharing one session store', async () => {
  const session = new MemoryStorage();
  const first = createAnalytics({ store: await makeStore(2, session), dispatch: () => {} });
  const second = createAnalytics({ store: await makeStore(2, session), dispatch: () => {} });
  assert.equal(first.emit('view_start').sessionId, second.emit('scene_enter').sessionId);
});

test('percentComplete handles the edges: empty flow and final scene', async () => {
  const empty = createAnalytics({ store: await makeStore(0), dispatch: () => {} });
  assert.equal(empty.emit('view_start').percentComplete, 0);
  const store = await makeStore(2);
  store.setPosition(1);
  assert.equal(createAnalytics({ store, dispatch: () => {} }).emit('flow_complete').percentComplete, 100);
});

test('view_start idempotence marker persists in the session', async () => {
  const session = new MemoryStorage();
  const analytics = createAnalytics({ store: await makeStore(2, session), dispatch: () => {} });
  assert.equal(analytics.viewStarted(), false);
  analytics.markViewStarted();
  assert.equal(analytics.viewStarted(), true);
  // A second instance (post-navigation reconstruction) sees the same marker.
  assert.equal(createAnalytics({ store: await makeStore(2, session), dispatch: () => {} }).viewStarted(), true);
});

test('no network is attempted without beaconUrl; sendBeacon wins over fetch when configured', async () => {
  const calls = { beacon: 0, fetch: 0 };
  let beaconResult = true;
  const transport = {
    sendBeacon: () => { calls.beacon += 1; return beaconResult; },
    fetch: async () => { calls.fetch += 1; return {}; },
  };
  const silent = createAnalytics({ store: await makeStore(1), dispatch: () => {}, transport });
  silent.emit('view_start');
  assert.deepEqual(calls, { beacon: 0, fetch: 0 });
  const beaconed = createAnalytics({ store: await makeStore(1), options: { beaconUrl: 'https://collector.test/events' }, dispatch: () => {}, transport });
  beaconed.emit('view_start');
  assert.deepEqual(calls, { beacon: 1, fetch: 0 });
  // sendBeacon refusing (returns false) falls back to fetch keepalive.
  beaconResult = false;
  beaconed.emit('scene_enter');
  assert.deepEqual(calls, { beacon: 2, fetch: 1 });
});

test('share flag rides the session and is cleared by clearRun', async () => {
  const store = await makeStore(2);
  store.setShare(true);
  assert.equal(store.share(), true);
  assert.equal(createAnalytics({ store, dispatch: () => {} }).emit('view_start').share, true);
  store.clearRun();
  assert.equal(store.share(), false);
});
