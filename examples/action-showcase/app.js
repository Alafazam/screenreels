/* ScreenReel action-showcase page: mounts Projector and launches the guided tour.
   Page fixtures live in fixtures.js, shared with destination.html.
   Tour pacing lives in screenreel.demo.json — the timings there are the real durations, so
   Studio shows true numbers. Pass `timeScale` to mount if you want to stretch or compress
   everything uniformly (it reaches the runtime's internal constants too, which rewriting the
   manifest cannot).

   Wrapped in an IIFE: this and fixtures.js are classic scripts sharing one global scope, so any
   top-level binding here could collide with one there and kill the whole script. */
(function initDemoPage() {
const demoButton = document.getElementById('demo-button');
if (demoButton) {
  (async () => {
    const projector = await window.ScreenReel.mount(demoButton, {
      projectId: 'action-showcase',
      flow: { src: 'screenreel.demo.json' },
      loop: false,
    });
    let launching = false;
    // Capture phase + stopImmediatePropagation so this pre-empts the projector's own toggle
    // handler: the button should always force-play the guided tour from the start.
    demoButton.addEventListener('click', async (event) => {
      event.stopImmediatePropagation();
      if (projector.store.enabled()) { projector.disable(); return; }
      if (launching) return;
      launching = true;
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

/* Voiceover sample: the real pipeline is `assemble --voice`, which runs macOS `say` (or any TTS
   CLI) through ffmpeg into the captured MP4 — none of which exists in a browser. This uses
   speechSynthesis purely so a visitor can hear what narrated talking points sound like; the card
   says so in as many words. Same stand-in as the showcase's voice chapter. */
const voiceSample = document.getElementById('voice-sample');
if (voiceSample && 'speechSynthesis' in window) {
  const setPressed = (on) => voiceSample.setAttribute('aria-pressed', String(on));
  setPressed(false);
  voiceSample.addEventListener('click', () => {
    if (speechSynthesis.speaking) { speechSynthesis.cancel(); setPressed(false); return; }
    const utterance = new SpeechSynthesisUtterance(voiceSample.dataset.script);
    utterance.rate = 0.95;
    utterance.addEventListener('end', () => setPressed(false));
    utterance.addEventListener('error', () => setPressed(false));
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
    setPressed(true);
  });
} else if (voiceSample) {
  // No speech engine: say so rather than leaving a button that silently does nothing.
  voiceSample.disabled = true;
  voiceSample.textContent = 'Speech not available in this browser';
}
})();
