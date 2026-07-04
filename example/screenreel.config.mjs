// Example config: capture the Increff MS prototype (this repo) with screenreel.
// Doubles as the package's end-to-end verification harness — it exercises the
// injected director against an app WITHOUT any app-side capture hook.
// Prereq: node app/server.js running on :8080 (dev auth) from
// ui/increff-merchandising-system/.
export default {
  baseUrl: 'http://127.0.0.1:8080',
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
    open: { title: 'Dataflow Studio', sub: 'Captured with screenreel - zero app integration' },
    perScene: true,
    durS: 2.2,
    openDurS: 2.6,
    bg: '0x0F172A',
  },

  async login(page, config) {
    await page.goto(config.baseUrl + '/login');
    await page.fill('input[name="username"]', 'demo');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
  },

  // Pin the light theme, same as the trailer rig does.
  initScript: `try { localStorage.setItem('ms_theme', 'light'); } catch (e) {}`,
};
