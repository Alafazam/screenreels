// Example config: a two-scene reel captured against your own running web app.
// Shows the shape of a real config — the injected director drives the journey
// with NO app-side capture hook required.
// Point baseUrl at your dev server and set the scene routes in scenes.json to
// real paths in your app; the selectors below are placeholders to replace.
export default {
  baseUrl: 'http://localhost:3000',
  scenes: './scenes.json',

  out: {
    clips: './screenreel-output/clips',
    video: './screenreel-output/dataflow-mini-reel.mp4',
    tmp: './screenreel-output/.capture-tmp',
  },

  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 2,
  fps: 30,
  videoSize: { w: 1920, h: 1080 },

  titleCards: {
    open: { title: 'Your App', sub: 'Captured with screenreel - zero app integration' },
    perScene: true,
    durS: 2.2,
    openDurS: 2.6,
    bg: '0x0F172A',
  },

  // Authenticate once per run — adjust the route and selectors to your app.
  async login(page, config) {
    await page.goto(config.baseUrl + '/login');
    await page.fill('input[name="username"]', 'demo');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
  },

  // Pin state before app scripts run (e.g. force a stable theme).
  initScript: `try { localStorage.setItem('theme', 'light'); } catch (e) {}`,
};
