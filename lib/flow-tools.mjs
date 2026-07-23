import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'url';
import { resolveChrome } from './config.mjs';
import '../packages/core/action-runtime.js';
import '../packages/core/flow-store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const runtime = fs.readFileSync(path.join(here, '../packages/core/action-runtime.js'), 'utf8');
const adapter = fs.readFileSync(path.join(here, '../packages/capture/inject-adapter.js'), 'utf8');
const cursor = fs.readFileSync(path.join(here, 'inject/cursor.js'), 'utf8');
const jsonResult = (ok, details) => ({ ok, ...details });

export function loadManifest(file, baseHref = 'http://screenreel.local/') {
  const payload = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  return globalThis.ScreenReelStore.normalizeManifest(payload, baseHref);
}
async function browserPage(baseUrl) {
  const browser = await chromium.launch({ executablePath: resolveChrome(), args: ['--hide-scrollbars'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  return { browser, page, url: (route) => new URL(route, `${baseUrl.replace(/\/$/, '')}/`).href };
}
export async function inspectFlow({ baseUrl, route }) {
  const { browser, page, url } = await browserPage(baseUrl);
  try {
    await page.goto(url(route || '/'), { waitUntil: 'domcontentloaded' }); await page.addScriptTag({ content: runtime });
    const data = await page.evaluate(() => ({ route: `${location.pathname}${location.search}${location.hash}`, title: document.title, targets: window.ScreenReelCore.inspectDocument(document) }));
    return jsonResult(true, data);
  } finally { await browser.close(); }
}
export async function validateFlow({ baseUrl, flowFile }) {
  const manifest = loadManifest(flowFile, baseUrl); const { browser, page, url } = await browserPage(baseUrl); const scenes = [];
  try {
    for (const flow of manifest.flows) for (const scene of flow.scenes) {
      const errors = []; try { await page.goto(url(scene.route), { waitUntil: 'domcontentloaded' }); await page.addScriptTag({ content: runtime }); } catch (error) { errors.push(`route: ${error.message}`); }
      const actions = [];
      for (let index = 0; index < scene.actions.length; index++) {
        const action = scene.actions[index]; const actionErrors = await page.evaluate((candidate) => window.ScreenReelCore.validate(candidate, document, location.href), action).catch((error) => [error.message]); actions.push({ index, actionId: action.id, type: action.type, selector: action.selector, errors: actionErrors }); errors.push(...actionErrors.map((message) => `action ${index + 1}: ${message}`));
      }
      scenes.push({ flowId: flow.id, sceneId: scene.id, route: scene.route, ok: !errors.length, errors, actions });
    }
  } finally { await browser.close(); }
  return jsonResult(scenes.every((scene) => scene.ok), { scenes });
}
export async function testFlow({ baseUrl, flowFile, sceneId, screenshots }) {
  const manifest = loadManifest(flowFile, baseUrl); const scene = manifest.flows.flatMap((flow) => flow.scenes).find((item) => item.id === sceneId);
  if (!scene) return jsonResult(false, { error: `Unknown scene: ${sceneId}` });
  const { browser, page, url } = await browserPage(baseUrl); const shots = []; const output = path.resolve(screenshots || './screenreel-output/test'); fs.mkdirSync(output, { recursive: true });
  try {
    await page.addInitScript({ content: [cursor, runtime, adapter].join('\n;\n') }); await page.goto(url(scene.route), { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.__screenreel);
    const before = path.join(output, `${scene.id}-before.png`); await page.screenshot({ path: before }); shots.push(before);
    await page.evaluate((candidate) => window.__screenreel.runActions(candidate), scene);
    const after = path.join(output, `${scene.id}-after.png`); await page.screenshot({ path: after }); shots.push(after);
    return jsonResult(true, { sceneId: scene.id, screenshots: shots });
  } catch (error) { return jsonResult(false, { sceneId: scene.id, error: error.message, screenshots: shots }); }
  finally { await browser.close(); }
}
export function migrateFlow({ input, output }) { const manifest = loadManifest(input); fs.writeFileSync(path.resolve(output), `${JSON.stringify(manifest, null, 2)}\n`); return jsonResult(true, { input: path.resolve(input), output: path.resolve(output), flows: manifest.flows.length }); }
export function installProjector({ output }) {
  const source = path.resolve(here, '../dist/projector'); const destination = path.resolve(output); if (!fs.existsSync(source)) throw new Error('Projector assets are not built. Run npm run build.');
  fs.mkdirSync(destination, { recursive: true }); fs.cpSync(source, destination, { recursive: true }); return jsonResult(true, { output: destination, files: fs.readdirSync(destination).sort() });
}
