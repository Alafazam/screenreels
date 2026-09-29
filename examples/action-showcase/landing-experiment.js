/*
 * Provider-neutral landing-page experiment helpers.
 *
 * This module intentionally knows nothing about Microsoft Clarity (or any
 * other analytics provider). The page can adapt the returned events at its
 * boundary when an analytics provider is ready.
 */

export const LANDING_VARIANTS = Object.freeze({
  REPO_NATIVE: 'repo-native',
  PRODUCT_IN_PRODUCT: 'product-in-product',
});

export const DEFAULT_LANDING_VARIANT = LANDING_VARIANTS.REPO_NATIVE;
export const LANDING_VARIANT_QUERY_PARAM = 'variant';
export const LANDING_VARIANT_STORAGE_KEY = 'screenreel:landing-hero:v1';

export const LANDING_CONVERSION_EVENTS = Object.freeze([
  'live_demo_start',
  'github_repository_open',
  'setup_docs_open',
  'demo_progress_50',
  'demo_complete',
  'demo_drop_off',
]);

const VALID_VARIANTS = new Set(Object.values(LANDING_VARIANTS));
const VALID_CONVERSION_EVENTS = new Set(LANDING_CONVERSION_EVENTS);

export function isLandingVariant(value) {
  return VALID_VARIANTS.has(value);
}

function queryValue(search) {
  if (search instanceof URLSearchParams) return search.get(LANDING_VARIANT_QUERY_PARAM);
  if (typeof search !== 'string') return null;
  return new URLSearchParams(search.startsWith('?') ? search : `?${search}`).get(LANDING_VARIANT_QUERY_PARAM);
}

function read(storage, key) {
  if (!storage || typeof storage.getItem !== 'function') return null;
  return storage.getItem(key);
}

function write(storage, key, value) {
  if (!storage || typeof storage.setItem !== 'function') return;
  storage.setItem(key, value);
}

/**
 * Select a landing-page hero variant.
 *
 * A valid query-string override always wins and is deliberately never stored.
 * A valid stored assignment is reused. Allocation is disabled by default;
 * when enabled, a missing assignment is created with a stable random split.
 */
export function selectLandingVariant({
  search = '',
  storage,
  storageKey = LANDING_VARIANT_STORAGE_KEY,
  allocationEnabled = false,
  random = Math.random,
} = {}) {
  const override = queryValue(search);
  if (isLandingVariant(override)) return override;

  const stored = read(storage, storageKey);
  if (isLandingVariant(stored)) return stored;

  if (!allocationEnabled) return DEFAULT_LANDING_VARIANT;

  const assigned = random() < 0.5
    ? LANDING_VARIANTS.REPO_NATIVE
    : LANDING_VARIANTS.PRODUCT_IN_PRODUCT;
  write(storage, storageKey, assigned);
  return assigned;
}

/**
 * Create a provider-neutral conversion event adapter.
 *
 * The callback receives `{ event, ...detail }`. Invalid event names fail
 * loudly so page integrations cannot silently drift from the contract.
 */
export function createLandingAnalytics({ onEvent } = {}) {
  if (onEvent !== undefined && typeof onEvent !== 'function') {
    throw new TypeError('onEvent must be a function when provided');
  }

  return {
    emit(event, detail = {}) {
      if (!VALID_CONVERSION_EVENTS.has(event)) {
        throw new Error(`Unknown landing conversion event: ${event}`);
      }
      if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
        throw new TypeError('Landing conversion detail must be an object');
      }
      const payload = { event, ...detail };
      onEvent?.(payload);
      return payload;
    },
  };
}
