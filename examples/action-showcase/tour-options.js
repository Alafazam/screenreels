/* One home for the landing tour's Projector options. The tour starts on the landing page and
   continues on the Demo Lab pages, and each page mounts its own projector, so every page must mount
   it the same way or the chrome changes mid-tour. Loaded as a classic script before app.js and
   demo-lab.js. */
window.SCREENREEL_LANDING_TOUR = Object.freeze({
  projectId: 'action-showcase',
  flow: { src: 'screenreel.demo.json' },
  loop: false,
  pages: ['./', 'demo-lab.html', 'demo-lab-output.html', 'showcase-heal.html'],
  // The viewer picks Autoplay (the default: voiced, with actions timed to the words) or Guided (a
  // card per step, Next to continue). Autoplay is listed first, so it is the focused choice.
  // The overrides keep the tour's compact look: no start card, progress bar, or end card.
  playback: {
    force: 'ask',
    modes: ['autoplay', 'guided'],
    // Guided needs no pill: its controls live in the card. Studio stays in the bar here because it
    // is the product this site sells.
    autoplay: { controls: ['count', 'prev', 'play', 'next', 'sound', 'studio', 'exit'], controlLabels: false, progress: false, startCard: false, endCard: false },
    guided: { controls: [] },
  },
  position: 'center',
  // Closing or finishing the tour returns the visitor to where they started it.
  restoreOnExit: true,
  disableOnComplete: true, // the player and cursor go away when the tour ends
  // Narration plays only from the committed ElevenLabs files (audio/landing/, made by
  // scripts/voice-render.mjs). The browser's built-in speech is never used.
  narration: { speech: false },
});
