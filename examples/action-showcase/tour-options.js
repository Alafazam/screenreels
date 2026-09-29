/* One home for the landing tour's Projector options. The tour starts on the landing page and
   continues on the Demo Lab pages, and each page mounts its own projector, so every page must mount
   it the same way or the chrome changes mid-tour. Loaded as a classic script before app.js and
   demo-lab.js. */
window.SCREENREEL_LANDING_TOUR = Object.freeze({
  projectId: 'action-showcase',
  flow: { src: 'screenreel.demo.json' },
  loop: false,
  pages: ['./', 'demo-lab.html', 'demo-lab-output.html', 'showcase-heal.html'],
  // The viewer picks Guided (a card per step, Next to continue) or Autoplay (a compact, centred
  // bar). Guided needs no pill: its controls live in the card. Studio stays in the bar here
  // because it is the product this site sells.
  chooser: true,
  controls: { guided: [], auto: ['count', 'prev', 'play', 'next', 'sound', 'studio', 'exit'] },
  position: 'center',
  // Closing or finishing the tour returns the visitor to where they started it.
  restoreOnExit: true,
  // Muted until narration uses a better voice than the browser's built-in speech.
  narration: false,
});
