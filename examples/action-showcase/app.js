/* ScreenReel action-showcase page: mounts Projector and launches the guided tour.
   Page fixtures live in fixtures.js, shared with destination.html.
   Tour pacing lives in screenreel.demo.json — the timings there are the real durations, so
   Studio shows true numbers. Pass `timeScale` to mount if you want to stretch or compress
   everything uniformly (it reaches the runtime's internal constants too, which rewriting the
   manifest cannot). */

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
