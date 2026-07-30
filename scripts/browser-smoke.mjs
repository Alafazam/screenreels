import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { resolveChrome } from '../lib/config.mjs';

const baseUrl = process.env.SCREENREEL_EXAMPLE_URL || 'http://127.0.0.1:4173/examples/action-showcase/';
const output = path.resolve('./screenreel-output/browser-smoke'); fs.rmSync(output, { recursive: true, force: true }); fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: resolveChrome(), args: ['--hide-scrollbars'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
async function visiblePill(targetPage) {
  const pill = targetPage.locator('.sr-pill');
  await pill.waitFor();
  const handle = await pill.elementHandle();
  await targetPage.waitForFunction((element) => getComputedStyle(element).position === 'absolute', handle);
  return pill;
}
try {
  page.on('console', (message) => { if (message.type() === 'error') console.error('[browser]', message.text()); });
  page.on('pageerror', (error) => console.error('[pageerror]', error.message));
  page.on('response', (response) => { if (response.status() >= 400) console.error('[response]', response.status(), response.url()); });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }); await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#demo-button')?.hasAttribute('aria-pressed'));
  assert.equal(await page.locator('h1').innerText(), 'One product flow.\nLive demo, editable walkthrough, polished video.');
  // Clicking "Open live demo" plays the default guided tour (with a countdown as its first action).
  const trigger = page.locator('#demo-button'); await trigger.waitFor(); assert.equal(await trigger.count(), 1); assert.equal(await trigger.getAttribute('aria-pressed'), 'false'); await trigger.click();
  const pill = await visiblePill(page); assert.equal(await pill.count(), 1);
  const validation = await page.evaluate(() => window.ScreenReel.validateScene()); assert.equal(validation.ok, true); assert.equal(validation.sceneId, 'tour-opening');
  assert.equal(await page.locator('.sr-count').innerText(), '1/6');
  await page.locator('.sr-glow-box').waitFor({ state: 'visible', timeout: 9000 });
  // The agent cursor must be live during playback: the Projector supplies moveCursor to the
  // executor, so a missing node means the cursor call sites have gone back to being no-ops.
  await page.locator('#__screenreelCursor').waitFor({ state: 'visible', timeout: 9000 });
  await page.screenshot({ path: path.join(output, 'projector-1280x720.png') });
  await page.waitForFunction(() => document.querySelector('#customer-name')?.value === 'Northstar Retail' && document.querySelector('#region')?.value === 'West' && document.querySelector('#priority')?.checked && document.querySelector('#confidence')?.value === '95', null, { timeout: 45000 });
  assert((await page.evaluate(() => window.scrollY)) > 0);
  await page.waitForURL(/destination\.html\?from=showcase/, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await visiblePill(page); await page.locator('.sr-glow-box').waitFor({ state: 'visible', timeout: 6000 });
  assert.equal(await page.locator('.sr-count').innerText(), '6/6');
  await page.screenshot({ path: path.join(output, 'projector-destination-1280x720.png') });
  await page.waitForURL(/\/action-showcase\/(index\.html)?$/, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' }); await visiblePill(page);
  await page.locator('button[title="Open ScreenReel Studio"]').click(); const heading = page.getByRole('heading', { name: 'Demo flows', exact: true }); await heading.waitFor();
  const showcaseRow = page.locator('.sr-flow-row').filter({ hasText: 'All actions showcase' }).first(); await showcaseRow.getByRole('button', { name: 'Duplicate', exact: true }).click();
  const localRow = page.locator('.sr-flow-row').filter({ hasText: 'All actions showcase copy' }); assert.equal(await localRow.count(), 1); await localRow.locator('.sr-flow-name').click();
  await page.getByRole('heading', { name: 'All actions showcase copy', exact: true }).waitFor(); assert.equal(await page.locator('.sr-scene-table tbody tr').count(), 4);
  const editButtons = page.getByRole('button', { name: 'Edit', exact: true }); assert.equal(await editButtons.count(), 4); await editButtons.nth(0).click();
  const titleField = page.locator('[data-field="title"]'); await titleField.fill('Studio-authored highlight');
  await page.getByRole('button', { name: 'Add action', exact: true }).click(); assert.equal(await page.locator('[data-definition]').count(), 26); assert.equal(await page.locator('[data-recipe]').count(), 6);
  await page.locator('[data-definition="highlight"]').click(); const preview = page.frameLocator('.sr-preview-frame'); const kpiValue = preview.locator('[data-kpi="revenue"] strong'); await kpiValue.click();
  const savedTarget = page.locator('.sr-action small').filter({ hasText: '[data-kpi="revenue"]' }); await savedTarget.waitFor(); assert.equal(await savedTarget.count(), 1);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  assert.equal(await page.locator('.sr-dirty').count(), 0);
  assert(await page.evaluate(() => JSON.parse(localStorage.getItem('screenreel:action-showcase:flows:v1')).flows.some((flow) => flow.scenes.some((scene) => scene.title === 'Studio-authored highlight' && scene.actions.length === 11))));
  // Record-by-doing: trusted interactions inside the preview iframe become actions incrementally,
  // without a re-render (the checkbox click must NOT double-emit alongside its toggle).
  const recordButton = page.locator('[data-record]'); await recordButton.click();
  await page.locator('.sr-picker-banner').waitFor({ state: 'visible' });
  await preview.locator('#submit-control').click();
  await preview.locator('#customer-name').pressSequentially('Recorded Co', { delay: 40 });
  await preview.locator('#priority').check();
  await recordButton.click();
  await page.locator('.sr-picker-banner').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.sr-action').count(), 14);
  assert.equal(await page.locator('.sr-action small').filter({ hasText: '#customer-name' }).count(), 1);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  assert.equal(await page.locator('.sr-dirty').count(), 0);
  assert(await page.evaluate(() => JSON.parse(localStorage.getItem('screenreel:action-showcase:flows:v1')).flows.some((flow) => flow.scenes.some((scene) => scene.actions.length === 14 && scene.actions.some((action) => action.type === 'type' && action.text === 'Recorded Co')))));
  await page.getByRole('button', { name: 'Back to scenes', exact: true }).click();
  await page.getByRole('heading', { name: 'All actions showcase copy', exact: true }).waitFor(); assert.equal(await page.locator('.sr-scene-table tbody tr').filter({ hasText: 'Studio-authored highlight' }).count(), 1);
  await page.setViewportSize({ width: 1440, height: 900 }); await page.screenshot({ path: path.join(output, 'studio-1440x900.png') });
  await page.getByRole('button', { name: 'Play flow', exact: true }).click();
  await page.locator('.sr-studio').waitFor({ state: 'detached' });
  await page.locator('.sr-action-box,.sr-glow-box').waitFor({ state: 'visible', timeout: 5000 });
  assert.equal(await page.locator('.sr-flow').evaluate((node) => node.selectedOptions[0].textContent), 'All actions showcase copy');
  await page.locator('button[title="Pause"]').click();
  const spaPage = await browser.newPage({ viewport: { width: 1280, height: 720 } }); await spaPage.goto(new URL('../spa-router/', baseUrl).href, { waitUntil: 'domcontentloaded' });
  const spaTrigger = spaPage.locator('#demo-button'); await spaTrigger.waitFor(); await spaTrigger.click(); await visiblePill(spaPage);
  await spaPage.locator('button[title="Play"]').click(); await spaPage.locator('.sr-glow-box').waitFor({ state: 'visible', timeout: 5000 });
  await spaPage.locator('button[title="Next scene"]').click(); await spaPage.waitForURL(/view=details/); await spaPage.locator('.sr-glow-box').waitFor({ state: 'visible', timeout: 5000 });
  assert.match(spaPage.url(), /view=details/); await spaPage.locator('button[title="Pause"]').click(); await spaPage.close();
  const inlinePage = await browser.newPage({ viewport: { width: 1280, height: 720 } }); await inlinePage.goto(new URL('../inline-flow/', baseUrl).href, { waitUntil: 'domcontentloaded' }); const inlineTrigger = inlinePage.locator('#demo-button'); await inlineTrigger.waitFor(); await inlinePage.waitForFunction(() => document.querySelector('#demo-button')?.hasAttribute('aria-pressed')); await inlineTrigger.click(); const inlinePill = await visiblePill(inlinePage); assert.equal(await inlinePill.count(), 1);
  const contracts = await inlinePage.evaluate(async () => {
    const target = document.createElement('button'); target.id = 'strict-demo'; document.body.appendChild(target);
    const projector = await window.ScreenReel.mount(target, { projectId: 'strict-example', strict: true, loop: false, routesEqual: (current, scene) => current.includes('/inline-flow/') && scene === '/legacy.html', flow: { data: { schemaVersion: 1, flows: [{ id: 'strict', name: 'Strict', scenes: [{ id: 'missing', route: '/legacy.html', actions: [{ type: 'highlight', selector: '#does-not-exist' }] }] }] } } });
    const report = projector.validateScene(); projector.enable(); await projector.play(); const playing = projector.store.playing(); const matched = projector.routeMatches({ route: '/legacy.html' }); projector.destroy(); target.remove();
    return { report, playing, matched };
  });
  assert.equal(contracts.matched, true); assert.equal(contracts.report.ok, false); assert.equal(contracts.report.actions[0].errors[0], 'selector has no matches'); assert.equal(contracts.playing, false);
  // Choice branching: clicking a card jumps playback to the target scene's enabled index.
  const choiceMounted = await inlinePage.evaluate(async () => {
    const target = document.createElement('button'); target.id = 'choice-demo'; document.body.appendChild(target);
    const route = `${location.pathname}${location.search}${location.hash}`;
    const projector = await window.ScreenReel.mount(target, { projectId: 'choice-example', loop: false, flow: { data: { schemaVersion: 1, flows: [{ id: 'branchy', name: 'Branchy', scenes: [
      { id: 'start', route, actions: [{ type: 'choice', prompt: 'Pick a path', options: [{ label: 'Skip ahead', scene: 'finale' }, { label: 'Next', scene: 'middle' }] }] },
      { id: 'middle', route, actions: [] },
      { id: 'finale', route, actions: [{ type: 'wait', ms: 4000 }] },
    ] }] } } });
    window.__choiceProjector = projector;
    projector.enable(); projector.store.setPosition(0); projector.play();
    return true;
  });
  assert.equal(choiceMounted, true);
  await inlinePage.locator('.sr-choice-overlay .sr-choice-card', { hasText: 'Skip ahead' }).click();
  await inlinePage.waitForFunction(() => window.__choiceProjector.store.position() === 2 && !document.querySelector('.sr-choice-overlay'));
  await inlinePage.evaluate(() => { window.__choiceProjector.pause(); window.__choiceProjector.destroy(); document.getElementById('choice-demo').remove(); });
  await inlinePage.close();
  const darkContext = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1440, height: 900 } }); const darkPage = await darkContext.newPage(); await darkPage.goto(baseUrl, { waitUntil: 'domcontentloaded' }); const darkTrigger = darkPage.locator('#demo-button'); await darkTrigger.waitFor(); await darkTrigger.click(); const lightPill = await visiblePill(darkPage); await darkPage.waitForFunction(() => getComputedStyle(document.documentElement).backgroundColor === 'rgb(255, 255, 255)'); assert.match(await lightPill.evaluate((node) => getComputedStyle(node).backgroundColor), /rgba?\(255, 255, 255/); await darkPage.locator('button[title="Open ScreenReel Studio"]').click(); await darkPage.locator('.sr-studio').waitFor(); assert.equal(await darkPage.locator('.sr-studio').evaluate((node) => getComputedStyle(node).backgroundColor), 'rgb(247, 247, 248)'); await darkPage.screenshot({ path: path.join(output, 'studio-light-under-dark-os-1440x900.png') }); await darkContext.close();
  // Share mode: ?demo=play auto-plays with viewer chrome only, and analytics events fire with a
  // stable session id. Fresh context so presenter-mode session state can't leak in.
  const shareContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const sharePage = await shareContext.newPage();
  await sharePage.addInitScript(() => { window.__analyticsEvents = []; addEventListener('screenreel:analytics', (e) => window.__analyticsEvents.push(e.detail)); });
  await sharePage.goto(`${baseUrl}?demo=play`, { waitUntil: 'domcontentloaded' });
  const sharePill = await visiblePill(sharePage);
  assert.equal(await sharePill.evaluate((node) => node.classList.contains('sr-pill--share')), true);
  assert.equal(await sharePage.locator('.sr-flow').count(), 0);
  assert.equal(await sharePage.locator('button[title="Open ScreenReel Studio"]').count(), 0);
  await sharePage.waitForFunction(() => (window.__analyticsEvents || []).some((item) => item.event === 'scene_enter'), null, { timeout: 9000 });
  const funnel = await sharePage.evaluate(() => window.__analyticsEvents);
  assert.equal(funnel[0].event, 'view_start');
  assert.equal(funnel[1].event, 'scene_enter');
  assert.equal(funnel[0].sessionId, funnel[1].sessionId);
  assert.equal(funnel[0].share, true);
  await sharePage.locator('button[title="Exit demo mode"]').click();
  await sharePage.locator('.sr-pill').waitFor({ state: 'detached' });
  await shareContext.close();
  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } }); await mobilePage.goto(baseUrl, { waitUntil: 'domcontentloaded' }); await mobilePage.locator('#demo-button').waitFor(); assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true); await mobilePage.screenshot({ path: path.join(output, 'landing-mobile-390x844.png'), fullPage: true }); await mobilePage.close();
  // The deployed artifact is _site/, not examples/: it has rewritten asset paths and cache-busting
  // queries, and its page scripts share one global scope. Exercising only examples/ once let a
  // broken bundle reach production, so the built artifact gets its own end-to-end check.
  const siteIndex = path.resolve('./_site/index.html');
  if (fs.existsSync(siteIndex)) {
    const sitePage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const siteErrors = [];
    sitePage.on('pageerror', (error) => siteErrors.push(error.message));
    sitePage.on('response', (response) => { if (response.status() >= 400) siteErrors.push(`${response.status()} ${response.url()}`); });
    await sitePage.goto(new URL('../../_site/index.html', baseUrl).href, { waitUntil: 'networkidle' });
    assert.deepEqual(siteErrors, [], `Pages artifact reported errors: ${siteErrors.join('; ')}`);
    const siteTrigger = sitePage.locator('#demo-button');
    await sitePage.waitForFunction(() => document.querySelector('#demo-button')?.hasAttribute('aria-pressed'));
    assert.equal(await siteTrigger.getAttribute('aria-pressed'), 'false');
    await siteTrigger.click();
    await visiblePill(sitePage);
    assert.equal(await siteTrigger.getAttribute('aria-pressed'), 'true', 'Pages artifact did not start the guided tour');
    assert.deepEqual(siteErrors, [], `Pages artifact reported errors while playing: ${siteErrors.join('; ')}`);
    await sitePage.close();
  } else {
    throw new Error('Run `npm run build:pages` before the browser smoke test so the deployed artifact is covered');
  }
  console.log(JSON.stringify({ ok: true, screenshots: fs.readdirSync(output).map((name) => path.join(output, name)) }, null, 2));
} finally { await browser.close(); }
