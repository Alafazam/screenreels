import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LANDING_VARIANT,
  LANDING_CONVERSION_EVENTS,
  LANDING_VARIANT_STORAGE_KEY,
  LANDING_VARIANTS,
  createLandingAnalytics,
  isLandingVariant,
  selectLandingVariant,
} from '../examples/action-showcase/landing-experiment.js';

class MemoryStorage {
  constructor(values = {}) { this.values = new Map(Object.entries(values)); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

test('variant IDs are explicit and validated', () => {
  assert.equal(isLandingVariant(LANDING_VARIANTS.REPO_NATIVE), true);
  assert.equal(isLandingVariant(LANDING_VARIANTS.PRODUCT_IN_PRODUCT), true);
  assert.equal(isLandingVariant('control'), false);
});

test('allocation is disabled by default and falls back to repo-native', () => {
  const storage = new MemoryStorage();
  assert.equal(selectLandingVariant({ storage, random: () => 0.99 }), DEFAULT_LANDING_VARIANT);
  assert.equal(storage.getItem(LANDING_VARIANT_STORAGE_KEY), null);
});

test('valid stored assignment is reused without reallocation', () => {
  const storage = new MemoryStorage({ [LANDING_VARIANT_STORAGE_KEY]: LANDING_VARIANTS.PRODUCT_IN_PRODUCT });
  let randomCalled = false;
  const variant = selectLandingVariant({ storage, allocationEnabled: true, random: () => { randomCalled = true; return 0; } });
  assert.equal(variant, LANDING_VARIANTS.PRODUCT_IN_PRODUCT);
  assert.equal(randomCalled, false);
});

test('enabled allocation assigns and persists a stable 50/50 variant', () => {
  const low = new MemoryStorage();
  assert.equal(selectLandingVariant({ storage: low, allocationEnabled: true, random: () => 0.49 }), LANDING_VARIANTS.REPO_NATIVE);
  assert.equal(low.getItem(LANDING_VARIANT_STORAGE_KEY), LANDING_VARIANTS.REPO_NATIVE);

  const high = new MemoryStorage();
  assert.equal(selectLandingVariant({ storage: high, allocationEnabled: true, random: () => 0.5 }), LANDING_VARIANTS.PRODUCT_IN_PRODUCT);
  assert.equal(selectLandingVariant({ storage: high, allocationEnabled: true, random: () => 0 }), LANDING_VARIANTS.PRODUCT_IN_PRODUCT);
});

test('invalid stored assignment is ignored', () => {
  const storage = new MemoryStorage({ [LANDING_VARIANT_STORAGE_KEY]: 'invalid' });
  assert.equal(selectLandingVariant({ storage }), DEFAULT_LANDING_VARIANT);
  assert.equal(storage.getItem(LANDING_VARIANT_STORAGE_KEY), 'invalid');
});

test('query override wins and never persists', () => {
  const storage = new MemoryStorage({ [LANDING_VARIANT_STORAGE_KEY]: LANDING_VARIANTS.REPO_NATIVE });
  assert.equal(selectLandingVariant({ search: '?variant=product-in-product', storage, allocationEnabled: true, random: () => 0 }), LANDING_VARIANTS.PRODUCT_IN_PRODUCT);
  assert.equal(storage.getItem(LANDING_VARIANT_STORAGE_KEY), LANDING_VARIANTS.REPO_NATIVE);
  assert.equal(selectLandingVariant({ search: '?variant=invalid', storage }), LANDING_VARIANTS.REPO_NATIVE);
});

test('landing analytics emits the named conversion contract', () => {
  const received = [];
  const analytics = createLandingAnalytics({ onEvent: (payload) => received.push(payload) });
  const payload = analytics.emit('live_demo_start', { variant: LANDING_VARIANTS.REPO_NATIVE });
  assert.deepEqual(payload, { event: 'live_demo_start', variant: LANDING_VARIANTS.REPO_NATIVE });
  assert.deepEqual(received, [payload]);
  assert.deepEqual(LANDING_CONVERSION_EVENTS, [
    'live_demo_start', 'github_repository_open', 'setup_docs_open',
    'demo_progress_50', 'demo_complete', 'demo_drop_off',
  ]);
});

test('landing analytics rejects unknown events and invalid details', () => {
  const analytics = createLandingAnalytics();
  assert.throws(() => analytics.emit('clarity_event'), /Unknown landing conversion event/);
  assert.throws(() => analytics.emit('demo_complete', null), /detail must be an object/);
});
