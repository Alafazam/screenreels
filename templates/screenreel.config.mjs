// screenreel configuration — environment knobs for capturing THIS app.
// Scenes (what to record) live in screenreel.scenes.json next to this file.
export default {
  // Where the app is running. Start your dev server before capturing.
  baseUrl: 'http://localhost:3000',

  scenes: './screenreel.scenes.json',

  out: {
    clips: './screenreel-output/clips',   // one all-intra mp4 per scene
    video: './screenreel-output/reel.mp4',
    tmp: './screenreel-output/.capture-tmp',
  },

  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 2,                   // capture at 2x, downscale = crisp text
  fps: 30,
  videoSize: { w: 1920, h: 1080 },

  titleCards: {
    open: { title: 'My Product', sub: 'The user journeys' },
    perScene: true,                       // card before each scene from scene.title/sub
    durS: 2.2,
    openDurS: 2.6,
    bg: '0x0F172A',
  },

  // font: '/absolute/path/to/font.ttf', // needed only if the platform default isn't found

  // Authenticate once per capture run. Delete if the app has no login.
  async login(page, config) {
    // await page.goto(config.baseUrl + '/login');
    // await page.fill('input[name="username"]', 'demo');
    // await page.click('button[type="submit"]');
    // await page.waitForLoadState('networkidle');
  },

  // Context-level setup before any page opens — e.g. serve CDN scripts from
  // local files when capturing in a network-restricted environment:
  // async prepare(context) {
  //   await context.route('**://unpkg.com/**', r =>
  //     r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync('node_modules/…') }));
  // },

  // Extra JS injected into every page before app scripts run — e.g. pin a theme:
  // initScript: `try { localStorage.setItem('theme', 'light'); } catch (e) {}`,
};
