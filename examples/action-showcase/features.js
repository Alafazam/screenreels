/* Feature-gallery page: mounts one Projector over features.demo.json and wires each card's
   button to the feature it demonstrates. Wrapped in an IIFE — page scripts share one global
   scope, and a top-level collision once broke the live site. */
(function initFeatureGallery() {
const EVENT_LOG_LIMIT = 40;

/* ---- Live analytics panel: everything the runtime emits lands here, nowhere else ---- */
const eventsNode = document.getElementById('fg-events');
const counters = { events: 0, scenes: 0, choices: 0 };
addEventListener('screenreel:analytics', (event) => {
  const detail = event.detail || {};
  counters.events += 1;
  if (detail.event === 'scene_enter') counters.scenes += 1;
  if (detail.event === 'choice') counters.choices += 1;
  document.getElementById('fg-count-events').textContent = String(counters.events);
  document.getElementById('fg-count-scenes').textContent = String(counters.scenes);
  document.getElementById('fg-count-choices').textContent = String(counters.choices);
  if (!eventsNode) return;
  const line = document.createElement('div');
  const stamp = new Date(detail.ts || Date.now()).toLocaleTimeString();
  line.textContent = `${stamp}  ${detail.event}  scene=${detail.sceneId ?? '—'}  ${detail.percentComplete ?? 0}%${detail.targetSceneId ? `  → ${detail.targetSceneId}` : ''}`;
  eventsNode.appendChild(line);
  while (eventsNode.children.length > EVENT_LOG_LIMIT) eventsNode.firstChild.remove();
  eventsNode.scrollTop = eventsNode.scrollHeight;
});

/* ---- One projector, many entry points ---- */
const tourButton = document.getElementById('fg-demo-button');
if (!tourButton) return;
(async () => {
  const projector = await window.ScreenReel.mount(tourButton, {
    projectId: 'feature-gallery',
    flow: { src: 'features.demo.json' },
    loop: false,
  });

  const playFlow = async (flowId) => {
    projector.store.setActive(flowId);
    projector.enable();
    projector.store.setPosition(0);
    await projector.play();
  };

  let launching = false;
  const launch = async (flowId) => {
    if (launching) return;
    launching = true;
    try { await playFlow(flowId); } finally { launching = false; }
  };

  // The header button force-plays the tour from the top (capture-phase, like the home page).
  tourButton.addEventListener('click', (event) => {
    event.stopImmediatePropagation();
    if (projector.store.enabled()) { projector.disable(); return; }
    launch('feature-tour');
  }, true);

  document.querySelector('[data-fg="branch"]')?.addEventListener('click', () => launch('branching-demo'));

  // Variables: the input feeds the same session store a ?srv_company= share link would.
  document.querySelector('[data-fg="personalize"]')?.addEventListener('click', () => {
    const company = document.getElementById('fg-company')?.value.trim();
    projector.store.setVariables(company ? { company } : {});
    projector.store.setActive('feature-tour');
    projector.enable();
    // Jump straight to the personalization scene (enabled-scene index 1).
    projector.store.setPosition(1);
    projector.play();
  });

  // Share mode: the same page, viewer chrome, auto-play — plus the personalized name if set.
  document.querySelector('[data-fg="share"]')?.addEventListener('click', () => {
    const company = document.getElementById('fg-company')?.value.trim();
    const url = new URL(location.href);
    url.searchParams.set('demo', 'play');
    if (company) url.searchParams.set('srv_company', company);
    open(url.href, '_blank', 'noopener');
  });

  // Recorder: open Studio on this page's flow; the preview iframes features.html itself.
  document.querySelector('[data-fg="open-studio"]')?.addEventListener('click', async () => {
    projector.store.setActive('feature-tour');
    const flow = projector.store.activeFlow();
    await projector.openStudio({ flowId: flow.id, sceneId: flow.scenes[1]?.id });
  });
})();

/* ---- Voiceover preview: browser speechSynthesis as a stand-in for the real TTS pipeline ---- */
document.querySelector('[data-fg="speak"]')?.addEventListener('click', () => {
  const script = 'The talking points you already write become narration. Screenreel assemble, dash dash voice, speaks each scene over the captured video.';
  if (!('speechSynthesis' in window)) {
    const toast = document.getElementById('toast');
    if (toast) { toast.textContent = 'This browser has no speech synthesis — the real feature uses say/ffmpeg anyway.'; toast.hidden = false; setTimeout(() => { toast.hidden = true; }, 2600); }
    return;
  }
  speechSynthesis.cancel();
  speechSynthesis.speak(new SpeechSynthesisUtterance(script));
});
})();
