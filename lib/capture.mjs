// Screenreel capture: records each scene of a running web app as an all-intra
// CFR H.264 clip.
//
// How it works (extracted from the ms-planning-brain trailer rig):
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ffmpegPath = () =>
  execFileSync('node', ['-p', "require('@ffmpeg-installer/ffmpeg').path"], { cwd: __dirname }).toString().trim();

export async function capture(config, scenes) {
  const cursorJs = fs.readFileSync(path.join(__dirname, 'inject/cursor.js'), 'utf8');
  const actionRuntimeJs = fs.readFileSync(path.join(__dirname, '../packages/core/action-runtime.js'), 'utf8');
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
  await page.addInitScript({ content: [config.initScript || '', cursorJs, actionRuntimeJs, directorJs].join('\n;\n') });

  if (config.login) await config.login(page, config);

  const results = [];
  let failed = 0;
  for (const scene of scenes) {
    try {
      results.push(await captureScene(page, scene, config, ffmpeg));
    } catch (err) {
      failed++;
      console.error(`[${scene.id}] FAILED:`, err.message);
    }
  }
  await browser.close();
  return { results, failed };
}

async function captureScene(page, scene, config, ffmpeg) {
  console.log(`\n[${scene.id}] ${scene.route}`);
  const url = scene.route.startsWith('http') ? scene.route : new URL(scene.route, `${config.baseUrl.replace(/\/$/, '')}/`).href;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__screenreel, null, { timeout: 15000 });
  // Let the page fully compose (fonts, charts, data) before the camera rolls.
  await page.waitForTimeout(scene.settleMs);
  await page.evaluate(() => window.__screenreelCursor && window.__screenreelCursor.show());

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
    await page.evaluate((s) => window.__screenreel.runActions(s), scene);
  } catch (err) {
    // A scene whose last action navigates destroys the evaluate context — expected.
    if (!scene.endsInNavigation) throw err;
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
  return assembleClip(scene.id, frameDir, frames, config, ffmpeg);
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
