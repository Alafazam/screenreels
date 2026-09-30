/* Shared logic for every showcase page. One projector (projectId 'screenreel-showcase') mounts on
   the header button on all seven pages, so the journey flow survives each cross-page hop.
   Feature wiring is presence-based: a page opts in by carrying the element. Wrapped in an IIFE —
   page scripts share one global scope, and a top-level collision once broke the live site. */
(function initShowcase() {
const EVENT_LOG_LIMIT = 40;
const COUNTER_KEY = 'screenreel-showcase:analytics-counters';

/* ---- Analytics: counters persist across the journey's page hops (session-scoped) ---- */
const readCounters = () => { try { return JSON.parse(sessionStorage.getItem(COUNTER_KEY)) || { events: 0, scenes: 0, choices: 0 }; } catch { return { events: 0, scenes: 0, choices: 0 }; } };
const paintCounters = (counters) => {
  for (const [key, value] of Object.entries(counters)) {
    const node = document.getElementById(`sc-count-${key}`);
    if (node) node.textContent = String(value);
  }
};
paintCounters(readCounters());
addEventListener('screenreel:analytics', (event) => {
  const detail = event.detail || {};
  const counters = readCounters();
  counters.events += 1;
  if (detail.event === 'scene_enter') counters.scenes += 1;
  if (detail.event === 'choice') counters.choices += 1;
  sessionStorage.setItem(COUNTER_KEY, JSON.stringify(counters));
  paintCounters(counters);
  const feed = document.getElementById('sc-events');
  if (!feed) return;
  const line = document.createElement('div');
  line.textContent = `${new Date(detail.ts || Date.now()).toLocaleTimeString()}  ${detail.event}  scene=${detail.sceneId ?? '—'}  ${detail.percentComplete ?? 0}%${detail.targetSceneId ? `  → ${detail.targetSceneId}` : ''}`;
  feed.appendChild(line);
  while (feed.children.length > EVENT_LOG_LIMIT) feed.firstChild.remove();
  feed.scrollTop = feed.scrollHeight;
});

/* ---- Share-link builder: shows the URL a personalized viewer link would use ---- */
const shareUrlNode = document.getElementById('sc-share-url');
const companyInput = document.getElementById('sc-company');
const shareUrl = () => {
  const url = new URL('showcase.html', location.href);
  url.searchParams.set('demo', 'play');
  const company = companyInput?.value.trim();
  if (company) url.searchParams.set('srv_company', company);
  return url.href;
};
const paintShareUrl = () => { if (shareUrlNode) shareUrlNode.textContent = shareUrl(); };
companyInput?.addEventListener('input', paintShareUrl);
paintShareUrl();

/* ---- One projector across all pages; the journey resumes wherever it lands ---- */
const journeyButton = document.getElementById('sc-journey-button');
if (!journeyButton) return;
(async () => {
  const projector = await window.ScreenReel.mount(journeyButton, {
    projectId: 'screenreel-showcase',
    flow: { src: 'showcase.demo.json' },
    loop: false,
    // The journey asks Guided (a card per chapter, Next to continue) or Autoplay (a compact,
    // centred bar); closing it returns the visitor to where they started.
    chooser: true,
    controls: { guided: [], auto: ['count', 'prev', 'play', 'next', 'exit'] },
    position: 'center',
    restoreOnExit: true,
    disableOnComplete: true,
    narration: false, // muted until narration uses a better voice than the browser's built-in speech
  });

  // `mode` skips the chooser: the one-chapter demos just play.
  let launching = false;
  const launch = async (flowId, mode) => {
    if (launching) return;
    launching = true;
    try { await projector.start(flowId, { position: 0, mode }); } finally { launching = false; }
  };

  // Header button: force-play the journey from the top (capture phase, like the home page).
  journeyButton.addEventListener('click', (event) => {
    event.stopImmediatePropagation();
    if (projector.store.enabled()) { projector.disable('user'); return; }
    sessionStorage.removeItem(COUNTER_KEY); paintCounters({ events: 0, scenes: 0, choices: 0 });
    launch('journey');
  }, true);
  document.querySelectorAll('[data-sc="journey"]').forEach((node) => node.addEventListener('click', () => journeyButton.click()));

  document.querySelector('[data-sc="branch"]')?.addEventListener('click', () => launch('branching-demo', 'auto'));

  // Personalization: the input feeds the same session store a ?srv_company= link would.
  document.querySelector('[data-sc="personalize"]')?.addEventListener('click', () => {
    const company = companyInput?.value.trim();
    projector.store.setVariables(company ? { company } : {});
    paintShareUrl();
    launch('personalize-demo', 'auto');
  });

  document.querySelector('[data-sc="share"]')?.addEventListener('click', () => {
    open(shareUrl(), '_blank', 'noopener');
  });

  // Recorder: open Studio on the sandbox flow; the preview iframes this chapter itself.
  document.querySelector('[data-sc="open-studio"]')?.addEventListener('click', async () => {
    projector.store.setActive('record-sandbox');
    const flow = projector.store.activeFlow();
    await projector.openStudio({ flowId: flow.id, sceneId: flow.scenes[0]?.id });
  });
})();

/* ---- Voiceover preview: browser speechSynthesis standing in for the say/ffmpeg pipeline ---- */
document.querySelector('[data-sc="speak"]')?.addEventListener('click', () => {
  const script = document.querySelector('[data-sc-script]')?.getAttribute('data-sc-script') || 'Screenreel assemble, dash dash voice, narrates each scene from the talking points you already write.';
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  speechSynthesis.speak(new SpeechSynthesisUtterance(script));
});
})();
