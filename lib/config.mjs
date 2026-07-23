// Config + scenes loading for screenreel.
//
// A project using screenreel has two files:
//   screenreel.config.mjs — environment: baseUrl, login hook, output paths, video knobs
//   scenes JSON           — the journeys: per-scene route, waitFor, actions, title card
//
// Scenes carry everything about WHAT to record; config carries everything about
// WHERE and HOW. That split keeps scenes copy-pastable between projects.

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

export const DEFAULTS = {
  baseUrl: 'http://localhost:3000',
  scenes: './screenreel.scenes.json',
  out: {
    clips: './screenreel-output/clips',
    video: './screenreel-output/reel.mp4',
    tmp: './screenreel-output/.capture-tmp',
  },
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 2,
  fps: 30,
  videoSize: { w: 1920, h: 1080 },
  titleCards: {
    open: null,          // { title, sub } — or null for no opening card
    perScene: true,      // one card before each scene, from scene.title/scene.sub
    durS: 2.2,
    openDurS: 2.6,
    bg: '0x0F172A',
    titleColor: 'white',
    subColor: '0x94A3B8',
  },
  font: null,            // absolute path to a font file; platform default if null
  jpegQuality: 92,
  login: null,           // async (page) => {}   — authenticate once per capture run
  prepare: null,         // async (context) => {} — route shims, extra setup
  initScript: '',        // extra JS injected into every page (e.g. theme localStorage)
};

const SCENE_DEFAULTS = { settleMs: 900, leadInMs: 1400, tailMs: 2000, endsInNavigation: false };

export async function loadConfig(configPath) {
  const abs = path.resolve(configPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`config not found: ${abs}\nRun "screenreel init" to scaffold one.`);
  }
  const mod = await import(pathToFileURL(abs).href);
  const user = mod.default || {};
  const config = {
    ...DEFAULTS,
    ...user,
    out: { ...DEFAULTS.out, ...(user.out || {}) },
    viewport: { ...DEFAULTS.viewport, ...(user.viewport || {}) },
    videoSize: { ...DEFAULTS.videoSize, ...(user.videoSize || {}) },
    titleCards: { ...DEFAULTS.titleCards, ...(user.titleCards || {}) },
  };
  // Relative paths resolve against the config file's directory, so a config
  // checked into a repo works from any cwd.
  const base = path.dirname(abs);
  config.scenes = path.resolve(base, config.scenes);
  for (const key of Object.keys(config.out)) config.out[key] = path.resolve(base, config.out[key]);
  config._dir = base;
  return config;
}

export function loadScenes(config) {
  if (!fs.existsSync(config.scenes)) throw new Error(`scenes file not found: ${config.scenes}`);
  const doc = JSON.parse(fs.readFileSync(config.scenes, 'utf8'));
  const defaults = { ...SCENE_DEFAULTS, ...(doc.defaults || {}) };
  const sources = Array.isArray(doc.flows)
    ? doc.flows.flatMap(flow => (flow.scenes || []).map(scene => ({ ...flow.defaults, ...scene })))
    : (doc.scenes || doc.steps || []);
  const scenes = sources.map(s => ({ ...defaults, ...s }));
  const bad = scenes.filter(s => !s.id || !s.route);
  if (bad.length) throw new Error(`every scene needs an "id" and a "route" (missing on ${bad.length} scene(s))`);
  const ids = new Set();
  for (const s of scenes) {
    if (ids.has(s.id)) throw new Error(`duplicate scene id: ${s.id}`);
    ids.add(s.id);
  }
  return scenes;
}

export function resolveFont(config) {
  if (config.font) {
    if (!fs.existsSync(config.font)) throw new Error(`configured font not found: ${config.font}`);
    return config.font;
  }
  const candidates = [
    '/System/Library/Fonts/Helvetica.ttc',
    '/System/Library/Fonts/HelveticaNeue.ttc',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  ];
  const found = candidates.find(p => fs.existsSync(p));
  if (!found) {
    throw new Error(
      'no title-card font found. Set "font" in screenreel.config.mjs to an absolute path of a .ttf/.ttc on this machine.',
    );
  }
  return found;
}

export function resolveChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const globbed = fs.globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome');
  if (globbed[0]) return globbed[0];
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (fs.existsSync(mac)) return mac;
  throw new Error(
    'no Chrome/Chromium found. Set CHROME_PATH, or install Google Chrome, or provide a Playwright chromium under /opt/pw-browsers.',
  );
}
