/* ScreenReel action-showcase page: demo fixtures and the "How it's made" panel. */

/* ---- Page fixtures (unchanged behaviour) ---- */
const toast = (message) => { const node = document.getElementById('toast'); node.textContent = message; node.hidden = false; clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => { node.hidden = true; }, 1800); };
document.querySelector('[data-action="reveal-delayed"]')?.addEventListener('click', () => setTimeout(() => { document.getElementById('delayed-target').hidden = false; }, 650));
document.getElementById('confidence')?.addEventListener('input', (event) => { document.getElementById('confidence-output').textContent = `${event.target.value}%`; });
document.getElementById('submit-control')?.addEventListener('click', () => toast('Demo rocked 🤘'));
document.getElementById('pointer-target')?.addEventListener('pointerdown', () => toast('Raw pointer event received'));
window.showScreenReelResult = async (message = 'Page function called') => { await new Promise((resolve) => setTimeout(resolve, 120)); document.getElementById('hero-result').textContent = message; toast(message); };

/* ---- "How it's made" panel, driven by per-action screenreel:step events ---- */
const EXPLANATIONS = {
  highlight: 'Draws an animated ring around one element so the audience knows exactly where to look.',
  glow: 'Sweeps an animated highlight across a set of elements, one after another.',
  spotlight: 'Dims the whole page and spotlights a single element.',
  callout: 'Anchors a short text note beside the target element.',
  flash: 'Pulses the element a few times to punctuate a point.',
  reel: 'Spins the element’s text like a slot machine before it lands on the real word.',
  reveal: 'Reveals an image (here, a real Studio screenshot) zooming in over the target.',
  countdown: 'Shows a full-screen 3-2-1 countdown before the tour begins.',
  click: 'Dispatches a real click and drops a ripple where the pointer lands.',
  hover: 'Fires the real hover events so hover-only UI reveals itself.',
  focus: 'Moves keyboard focus to the field.',
  type: 'Types text character by character, exactly like a person would.',
  set: 'Sets a control value directly and fires input/change events.',
  toggle: 'Flips a checkbox or switch to the desired state.',
  lever: 'Animates a range slider smoothly to its target value.',
  drag: 'Performs a real pointer drag from a source to a destination.',
  pointer: 'Sends a raw pointer tap — no click shortcut.',
  scrollIntoView: 'Smoothly scrolls the target into view and waits for the scroll to settle.',
  scroll: 'Scrolls a container by a distance or to an edge.',
  wait: 'Pauses for a fixed beat so the story can breathe.',
  waitFor: 'Waits until an element appears or reaches a state before continuing.',
  goto: 'Navigates to another route while keeping the flow’s place.',
  call: 'Calls a registered page function; the runtime awaits it before the next step.',
};

const panel = document.getElementById('how-its-made');
const explainToggle = document.getElementById('explain-toggle');
function explainOn() { return !explainToggle || explainToggle.checked; }
function hidePanel() { if (panel) panel.hidden = true; }
explainToggle?.addEventListener('change', () => { if (!explainToggle.checked) hidePanel(); });
function renderPanel(detail) {
  if (!panel || !detail?.action || !explainOn()) return;
  const action = detail.action;
  const core = window.ScreenReelCore;
  const definition = core?.getDefinition?.(action.definitionId) || core?.definitionForAction?.(action) || null;
  const label = definition?.label || action.type;
  const category = definition?.category || 'Action';
  const explain = action.type === 'call' && action.fn === 'showScreenReelResult'
    ? 'Calls a safe, component-owned function — never arbitrary JavaScript.'
    : (EXPLANATIONS[action.type] || 'Runs a ScreenReel action.');
  document.getElementById('him-step').textContent = `Scene ${detail.sceneIndex + 1} · Step ${detail.actionIndex + 1}/${detail.total}`;
  document.getElementById('him-label').textContent = `${category} — ${label}`;
  document.getElementById('him-explain').textContent = explain;
  document.getElementById('him-code').textContent = JSON.stringify(action, null, 2);
  panel.hidden = false;
}
window.addEventListener('screenreel:step', (event) => renderPanel(event.detail));
window.addEventListener('screenreel:complete', () => {
  if (!panel) return;
  document.getElementById('him-step').textContent = 'Tour complete';
  document.getElementById('him-label').textContent = 'That’s the whole flow';
  document.getElementById('him-explain').textContent = 'The same JSON drives Projector, Studio, and Capture. Press Open live demo to replay.';
  document.getElementById('him-code').textContent = '';
  setTimeout(hidePanel, 3200);
});
window.addEventListener('screenreel:modechange', (event) => { if (!event.detail?.enabled) hidePanel(); });

/* ---- Tour pacing: one knob scales the guided-tour timings (bump to 2 for slower) ---- */
const TOUR_SPEED = 1.5;
const TIMING_KEYS = ['dwellMs', 'settleMs', 'holdMs', 'stepMs', 'durMs', 'afterMs', 'ms', 'charMs'];
function scaleManifest(manifest, factor) {
  for (const flow of manifest?.flows || []) {
    if (flow.id !== 'guided-tour') continue;
    const scale = (obj) => { for (const key of TIMING_KEYS) if (typeof obj?.[key] === 'number') obj[key] = Math.round(obj[key] * factor); };
    scale(flow.defaults);
    for (const scene of flow.scenes || []) { scale(scene); (scene.actions || []).forEach(scale); }
  }
  return manifest;
}

/* ---- Mount Projector and auto-play the guided tour from "Open live demo" ---- */
const demoButton = document.getElementById('demo-button');
if (demoButton) {
  window.ScreenReel.registerFn('showScreenReelResult', window.showScreenReelResult);
  (async () => {
    let flow = { src: 'screenreel.demo.json' };
    try { const response = await fetch('screenreel.demo.json', { cache: 'no-store' }); if (response.ok) flow = { data: scaleManifest(await response.json(), TOUR_SPEED) }; } catch { /* fall back to src */ }
    const projector = await window.ScreenReel.mount(demoButton, { projectId: 'action-showcase', flow, loop: false });
    let launching = false;
    demoButton.addEventListener('click', async (event) => {
      event.stopImmediatePropagation();
      if (projector.store.enabled()) { projector.disable(); hidePanel(); return; }
      if (launching) return; launching = true;
      try {
        projector.store.setActive('guided-tour');
        projector.enable();
        projector.store.setPosition(0);
        await projector.play();
      } finally { launching = false; }
    }, true);
    document.querySelector('[data-action="open-demo"]')?.addEventListener('click', () => demoButton.click());
  })();
}
