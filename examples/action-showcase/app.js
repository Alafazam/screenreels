import {
  DEFAULT_LANDING_VARIANT,
  createLandingAnalytics,
  selectLandingVariant,
} from './landing-experiment.js';

const LANDING_ALLOCATION_ENABLED = false;
const LANDING_EVENT_NAME = 'screenreel:landing-conversion';
const IS_STUDIO_PREVIEW = new URLSearchParams(location.search).has('screenreelPreview');

function browserRandom() {
  if (!globalThis.crypto?.getRandomValues) return Math.random();
  const value = new Uint32Array(1);
  globalThis.crypto.getRandomValues(value);
  return value[0] / 0x100000000;
}

function resolveVariant() {
  try {
    return selectLandingVariant({
      search: location.search,
      storage: localStorage,
      allocationEnabled: LANDING_ALLOCATION_ENABLED,
      random: browserRandom,
    });
  } catch (error) {
    console.warn('[screenreel] landing variant fallback', error);
    return DEFAULT_LANDING_VARIANT;
  }
}

function showVariant(variant) {
  document.documentElement.dataset.landingVariant = variant;
  for (const panel of document.querySelectorAll('[data-variant-panel]')) {
    panel.hidden = panel.dataset.variantPanel !== variant;
  }
  return document.querySelector(`[data-variant-panel="${variant}"]`);
}

const variant = resolveVariant();
const activePanel = showVariant(variant);
const analytics = createLandingAnalytics({
  onEvent: (payload) => dispatchEvent(new CustomEvent(LANDING_EVENT_NAME, { detail: payload })),
});

for (const target of document.querySelectorAll('[data-conversion]')) {
  target.addEventListener('click', () => analytics.emit(target.dataset.conversion, { variant }));
}

const demoButton = activePanel?.querySelector('.landing-demo-button');
if (demoButton && !IS_STUDIO_PREVIEW) {
  demoButton.id = 'demo-button';
  (async () => {
    const projector = await window.ScreenReel.mount(demoButton, {
      projectId: 'action-showcase',
      flow: { src: 'screenreel.demo.json' },
      loop: false,
      pages: ['./', 'demo-lab.html', 'demo-lab-output.html', 'showcase-heal.html'],
    });
    let launching = false;
    demoButton.addEventListener('click', async (event) => {
      event.stopImmediatePropagation();
      if (projector.store.enabled()) {
        projector.disable();
        return;
      }
      if (launching) return;
      launching = true;
      try {
        analytics.emit('live_demo_start', { variant });
        projector.store.setActive('guided-tour');
        projector.enable();
        projector.store.setPosition(0);
        await projector.play();
      } finally {
        launching = false;
      }
    }, true);
    demoButton.dataset.landingReady = 'true';
  })().catch((error) => {
    console.error('[screenreel] landing demo failed to initialize', error);
    demoButton.disabled = true;
  });
}

const emittedPlaybackConversions = new Set();
addEventListener('screenreel:analytics', (event) => {
  const detail = event.detail || {};
  const emitOnce = (conversion) => {
    if (emittedPlaybackConversions.has(conversion)) return;
    emittedPlaybackConversions.add(conversion);
    analytics.emit(conversion, { variant, flowId: detail.flowId, sceneId: detail.sceneId });
  };
  if (Number(detail.percentComplete) >= 50) emitOnce('demo_progress_50');
  if (detail.event === 'flow_complete') emitOnce('demo_complete');
  if (detail.event === 'drop_off') emitOnce('demo_drop_off');
});

document.querySelector('[data-action="open-demo"]')?.addEventListener('click', () => demoButton?.click());
