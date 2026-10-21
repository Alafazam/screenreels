// Screenreel capture: records each scene of a running web app as an all-intra
// CFR H.264 clip.
//
// How it works:
//   1. Launch Chrome via playwright-core; inject the fake cursor + the action
//      director into every page (addInitScript) — the target app needs ZERO
//      integration, only stable selectors.
//   2. Per scene: navigate, wait for readiness, roll a CDP screencast, run the
//      scene's actions in-page (clicks/glows/drags with the cursor visible),
//      hold a tail, stop.
//   3. Screencast emits frames only when pixels change; the frame timestamps
//      rebuild real pacing, then ffmpeg resamples to constant-fps all-intra
//      H.264 so every output frame is exact-seekable (edit/compose friendly).

import { chromium } from 'playwright-core';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveChrome } from './config.mjs';
import { ffmpegPath, probeDurationSeconds } from './media.mjs';
import { NARRATION_SIDECAR_SUFFIX } from './narration-track.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function capture(config, scenes) {
  const cursorJs = fs.readFileSync(path.join(__dirname, '../packages/core/cursor.js'), 'utf8');
  const actionRuntimeJs = fs.readFileSync(path.join(__dirname, '../packages/core/action-runtime.js'), 'utf8');
  // The step clock times a timed step's actions, as in the Projector (docs/playback.md).
  const stepClockJs = fs.readFileSync(path.join(__dirname, '../packages/core/step-clock.js'), 'utf8');
  const directorJs = fs.readFileSync(path.join(__dirname, '../packages/capture/inject-adapter.js'), 'utf8');
  const ffmpeg = ffmpegPath();

  const browser = await chromium.launch({
    executablePath: resolveChrome(),
    args: ['--hide-scrollbars', '--force-color-profile=srgb'],
  });
  const context = await browser.newContext({
    viewport: config.viewport,
    deviceScaleFactor: config.deviceScaleFactor,
  });
  if (config.prepare) await config.prepare(context);

  const page = await context.newPage();
  await page.addInitScript({ content: [config.initScript || '', cursorJs, actionRuntimeJs, stepClockJs, directorJs].join('\n;\n') });
  // Each timed card reports when it shows (inject-adapter.js). A binding survives the navigation a
  // scene can end with, which a return value from evaluate() does not.
  const stepsShown = [];
  await page.exposeFunction('__screenreelStepShown', (info) => { stepsShown.push(info); });

  if (config.login) await config.login(page, config);

  const results = [];
  let failed = 0;
  for (const scene of scenes) {
    try {
      stepsShown.length = 0;
      results.push(await captureScene(page, scene, config, ffmpeg, stepsShown));
    } catch (err) {
      failed++;
      console.error(`[${scene.id}] FAILED:`, err.message);
    }
  }
  await browser.close();
  return { results, failed };
}

async function captureScene(page, scene, config, ffmpeg, stepsShown) {
  console.log(`\n[${scene.id}] ${scene.route}`);
  const url = scene.route.startsWith('http') ? scene.route : new URL(scene.route, `${config.baseUrl.replace(/\/$/, '')}/`).href;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__screenreel, null, { timeout: 15000 });
  // Let the page fully compose (fonts, charts, data) before the camera rolls.
  await page.waitForTimeout(scene.settleMs);
  await page.evaluate(() => window.__screenreelCursor && window.__screenreelCursor.show());
  // Before the camera rolls: fetch each timed card's narration file, so the step can wait for it
  // as the live tour does, and so assemble can place it on the clip's audio track.
  const narration = await fetchNarration(scene, page.url(), config);
  const sidecar = path.join(config.out.clips, `${scene.id}${NARRATION_SIDECAR_SUFFIX}`);
  fs.rmSync(sidecar, { force: true }); // a stale sidecar would put an old take on a new clip

  const frameDir = path.join(config.out.tmp, scene.id);
  fs.rmSync(frameDir, { recursive: true, force: true });
  fs.mkdirSync(frameDir, { recursive: true });

  const frames = []; // { file, ts }
  const cdp = await page.context().newCDPSession(page);
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = `f${String(frames.length).padStart(5, '0')}.jpg`;
    fs.writeFileSync(path.join(frameDir, file), Buffer.from(data, 'base64'));
    frames.push({ file, ts: metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });

  await cdp.send('Page.startScreencast', {
    format: 'jpeg', quality: config.jpegQuality,
    maxWidth: config.viewport.width * config.deviceScaleFactor,
    maxHeight: config.viewport.height * config.deviceScaleFactor,
    everyNthFrame: 1,
  });
  await page.waitForTimeout(scene.leadInMs);
  try {
    const timing = { audioMs: Object.fromEntries(narration.map((item) => [item.card, item.durationMs])) };
    await page.evaluate(({ s, values, timing }) => window.__screenreel.runActions(s, values, timing), { s: scene, values: config.variables || null, timing });
  } catch (err) {
    // A scene whose last action navigates destroys the evaluate context — expected.
    if (!endsInNavigation(scene)) throw err;
    await page.waitForLoadState('networkidle').catch(() => {});
  }
  // Re-renders can recreate <img> tags; hold the take until they settle.
  await page.waitForFunction(
    () => [...document.images].every(img => !img.src || (img.complete && img.naturalWidth > 0)),
    null, { timeout: 8000 },
  ).catch(() => console.warn('  (images did not fully settle before tail)'));
  await page.waitForTimeout(scene.tailMs);
  await cdp.send('Page.stopScreencast');
  await page.waitForTimeout(300); // drain in-flight frames
  await cdp.detach().catch(() => {});

  if (frames.length < 5) throw new Error(`[${scene.id}] only ${frames.length} frames captured`);
  const clip = assembleClip(scene.id, frameDir, frames, config, ffmpeg);
  if (narration.length) writeNarrationSidecar(sidecar, scene, narration, stepsShown, frames[0].ts * 1000);
  return clip;
}

/* A scene that ends in a goto ends in a page load, which destroys the evaluate() context. Older
   scene files say so with endsInNavigation; a flow's last action says so by itself. */
function endsInNavigation(scene) {
  const last = (scene.actions || []).at(-1);
  return Boolean(scene.endsInNavigation || last?.type === 'goto');
}

/* The narration file of every card that starts a timed step: downloaded from the running app at
   the URL the browser would play (narrationAudio is relative to the page), and measured. */
async function fetchNarration(scene, pageUrl, config) {
  const cards = (scene.actions || [])
    .map((action, card) => ({ action, card }))
    .filter(({ action }) => action.type === 'callout' && action.stepMs > 0 && action.narrationAudio);
  if (!cards.length) return [];
  const dir = path.join(config.out.tmp, 'narration');
  fs.mkdirSync(dir, { recursive: true });
  const files = [];
  for (const { action, card } of cards) {
    const url = new URL(action.narrationAudio, pageUrl).href;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`[${scene.id}] narration file ${url} returned ${response.status}`);
    const file = path.join(dir, `${scene.id}-${card}${path.extname(new URL(url).pathname) || '.audio'}`);
    fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
    const durationMs = Math.round(probeDurationSeconds(file) * 1000);
    console.log(`  narration: card ${card} ${path.basename(new URL(url).pathname)} (${(durationMs / 1000).toFixed(1)}s)`);
    files.push({ card, file, durationMs });
  }
  return files;
}

/* `<clip>.narration.json`: where each file starts in the clip. A card's offset is the moment it
   showed (the page's clock) minus the first screencast frame (the same wall clock), because the
   clip's first frame is its time 0. */
function writeNarrationSidecar(sidecar, scene, narration, stepsShown, clipStartMs) {
  const steps = narration.map((item) => {
    const shown = stepsShown.find((info) => info.sceneId === scene.id && info.index === item.card);
    if (!shown) throw new Error(`[${scene.id}] card ${item.card} has a narration file but never showed during the take`);
    return { card: item.card, file: item.file, durationMs: item.durationMs, offsetMs: Math.round(shown.at - clipStartMs) };
  });
  fs.writeFileSync(sidecar, `${JSON.stringify({ sceneId: scene.id, steps }, null, 2)}\n`);
  console.log(`[${scene.id}] narration at ${steps.map((step) => `${(step.offsetMs / 1000).toFixed(2)}s`).join(', ')} → ${sidecar}`);
}

function assembleClip(sceneId, frameDir, frames, config, ffmpeg) {
  let list = '';
  for (let i = 0; i < frames.length; i++) {
    const dur = i + 1 < frames.length ? frames[i + 1].ts - frames[i].ts : 1 / config.fps;
    list += `file '${frames[i].file}'\nduration ${Math.max(dur, 0.001).toFixed(4)}\n`;
  }
  list += `file '${frames[frames.length - 1].file}'\n`;
  fs.writeFileSync(path.join(frameDir, 'list.txt'), list);

  fs.mkdirSync(config.out.clips, { recursive: true });
  const out = path.join(config.out.clips, `${sceneId}.mp4`);
  execFileSync(ffmpeg, [
    '-y', '-f', 'concat', '-safe', '0', '-i', path.join(frameDir, 'list.txt'),
    '-vf', `fps=${config.fps},scale=${config.videoSize.w}:${config.videoSize.h}:flags=lanczos`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-g', '1',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out,
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  console.log(`[${sceneId}] ${frames.length} frames → ${out}`);
  return out;
}
