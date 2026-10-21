// Records the landing tour ("ScreenReel in 90 seconds") as a narrated MP4. The voice is the
// committed ElevenLabs takes (audio/landing/), placed at the moment each card shows, so the video
// has the live tour's word timing and needs no TTS engine. Start the example server first:
//   pnpm example:serve
//   npx screenreel record --config examples/action-showcase/screenreel.landing.config.mjs
export default {
  baseUrl: process.env.SCREENREEL_EXAMPLE_URL || 'http://127.0.0.1:4173/examples/action-showcase/',
  scenes: './screenreel.demo.json',
  flow: 'guided-tour',
  out: { clips: './screenreel-output/landing-clips', video: './screenreel-output/landing-tour.mp4', tmp: './screenreel-output/.landing-tmp' },
  titleCards: { open: { title: 'ScreenReel', sub: 'A demo recorder that ships with your product' }, perScene: false },
  voice: { enabled: true },
};
