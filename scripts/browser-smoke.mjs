import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { resolveChrome } from '../lib/config.mjs';

const baseUrl = process.env.SCREENREEL_EXAMPLE_URL || 'http://127.0.0.1:4173/examples/action-showcase/';
const output = path.resolve('./screenreel-output/browser-smoke'); fs.rmSync(output, { recursive: true, force: true }); fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: resolveChrome(), args: ['--hide-scrollbars'] });
/* Narration is on by default, so an unguarded run speaks every scene out loud through the machine's
   real voice — intolerable on a developer's laptop and pointless in CI. This drives the same
   start/end handshake the narrator listens for without handing the utterance to the engine, so
   available() stays true (three assertions below depend on it) and nothing is ever audible. It runs
   before any page script, so the narrator captures this speak() when it loads. */
const silenceSpeech = (target) => target.addInitScript(() => {
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.speak = (utterance) => setTimeout(() => { utterance.dispatchEvent(new Event('start')); setTimeout(() => utterance.dispatchEvent(new Event('end')), 0); }, 0);
});
/* Wrapped once rather than at each of the eight call sites, so a page added later cannot forget. */
const openPage = browser.newPage.bind(browser); const openContext = browser.newContext.bind(browser);
browser.newPage = async (...args) => { const created = await openPage(...args); await silenceSpeech(created); return created; };
browser.newContext = async (...args) => { const created = await openContext(...args); await silenceSpeech(created); return created; };
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const pageErrors = [];
async function visiblePill(targetPage) {
  const pill = targetPage.locator('.sr-pill');
  await pill.waitFor();
  const handle = await pill.elementHandle();
  await targetPage.waitForFunction((element) => getComputedStyle(element).position === 'absolute', handle);
  return pill;
}
try {
  page.on('console', (message) => { if (message.type() === 'error') console.error('[browser]', message.text()); });
  page.on('pageerror', (error) => { pageErrors.push(error.message); console.error('[pageerror]', error.message); });
  page.on('response', (response) => { if (response.status() >= 400) console.error('[response]', response.status(), response.url()); });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }); await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#demo-button')?.hasAttribute('aria-pressed'));
  assert.equal(await page.locator('[data-variant-panel="repo-native"] h1').innerText(), 'A demo recorder\nthat ships with\nyour product.');
  assert.equal(await page.locator('[data-variant-panel="repo-native"]').isVisible(), true);
  assert.equal(await page.locator('[data-variant-panel="product-in-product"]').isVisible(), false);
  await page.goto(`${baseUrl}?variant=product-in-product`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#demo-button')?.hasAttribute('aria-pressed'));
  assert.equal(await page.locator('[data-variant-panel="product-in-product"] h1').innerText(), 'Record product demos\nthat live inside your\nproduct.');
  assert.equal(await page.evaluate(() => localStorage.getItem('screenreel:landing-hero:v1')), null);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  await page.waitForFunction(() => document.querySelector('#demo-button')?.dataset.landingReady === 'true');
  const productConversion = await page.evaluate(() => new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 1000);
    addEventListener('screenreel:landing-conversion', (event) => { clearTimeout(timeout); resolve(event.detail); }, { once: true });
    document.querySelector('#demo-button').click();
  }));
  await visiblePill(page);
  // Nothing plays until the viewer picks a mode; playing then routes to the first scene.
  await page.locator('[data-choose="auto"]').click();
  await page.waitForFunction(() => document.querySelector('#demo-button')?.dataset.landingReady === 'true' && !location.search.includes('variant'));
  await visiblePill(page);
  const productValidation = await page.evaluate(() => window.ScreenReel.validateScene());
  assert.equal(productValidation.ok, true); assert.equal(productValidation.sceneId, 'open-source-hook');
  assert.deepEqual(productConversion, { event: 'live_demo_start', variant: 'product-in-product' });
  // Mid-tour the click shield covers the page; a real click on the trigger is forwarded to it.
  await page.locator('#demo-button').click({ force: true });
  await page.waitForFunction(() => document.querySelector('#demo-button')?.getAttribute('aria-pressed') === 'false');
  await page.goto(`${baseUrl}?variant=product-in-product`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#demo-button')?.hasAttribute('aria-pressed'));
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileOverflow = await page.evaluate(() => ({ root: [document.documentElement.clientWidth, document.documentElement.scrollWidth], nodes: [...document.querySelectorAll('body *')].filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1 || element.getBoundingClientRect().left < -1 || element.scrollWidth > element.clientWidth + 1).slice(0, 12).map((element) => ({ tag: element.tagName, className: element.className, left: Math.round(element.getBoundingClientRect().left), right: Math.round(element.getBoundingClientRect().right), clientWidth: element.clientWidth, scrollWidth: element.scrollWidth })) }));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, JSON.stringify(mobileOverflow));
  await page.screenshot({ path: path.join(output, 'landing-product-mobile-390x844.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${baseUrl}?variant=repo-native&screenreelPreview=1`, { waitUntil: 'domcontentloaded' });
  assert.equal(await page.locator('#demo-button').count(), 0, 'Studio previews must not mount a nested ScreenReel projector');
  await page.getByRole('button', { name: 'Run the live demo' }).click(); // one CTA per variant panel; only repo-native is visible
  assert.equal(await page.locator('.sr-pill').count(), 0, 'the landing CTA must remain inert while it is a recording target');
  await page.goto(`${baseUrl}?variant=repo-native`, { waitUntil: 'domcontentloaded' });
  // The tour's final scene highlights this group; a full-width box put the ring around empty space.
  const heroActions = await page.locator('[data-variant-panel]:not([hidden]) [data-demo-id="hero-actions"]').evaluate((group) => ({ group: group.getBoundingClientRect().right, last: group.lastElementChild.getBoundingClientRect().right }));
  assert(heroActions.group <= heroActions.last + 1, `hero-actions spans past its buttons: ${JSON.stringify(heroActions)}`);
  await page.waitForFunction(() => document.querySelector('#demo-button')?.hasAttribute('aria-pressed'));
  // Both forced variants launch the same canonical six-scene dogfooding demo.
  const trigger = page.locator('#demo-button'); await trigger.waitFor(); assert.equal(await trigger.count(), 1); assert.equal(await trigger.getAttribute('aria-pressed'), 'false'); await trigger.click();
  // The landing asks Guided or Autoplay first; this pass checks Autoplay end to end.
  await page.locator('[data-choose="auto"]').click();
  const pill = await visiblePill(page); assert.equal(await pill.count(), 1);
  const validation = await page.evaluate(() => window.ScreenReel.validateScene()); assert.equal(validation.ok, true); assert.equal(validation.sceneId, 'open-source-hook');
  assert.equal(await page.locator('.sr-count').innerText(), '1/6');
  await page.locator('.sr-glow-box').waitFor({ state: 'visible', timeout: 9000 });
  // The agent cursor must be live during playback: the Projector supplies moveCursor to the
  // executor, so a missing node means the cursor call sites have gone back to being no-ops.
  await page.locator('#__screenreelCursor').waitFor({ state: 'visible', timeout: 15000 }); // first appears at scene 1's pointer, after its callout
  // The landing tour mounts with narration: false until it has a better voice, so the pill offers
  // no speaker there. narrator.js still loads: other hosts keep narration on by default.
  assert.equal(await page.locator('.sr-pill [data-cmd="capture"]').count(), 0);
  assert.equal(await page.locator('.sr-pill [data-cmd="sound"]').count(), 0);
  assert.equal(await page.evaluate(() => Boolean(window.__screenreelNarrator?.available())), true);
  await page.screenshot({ path: path.join(output, 'projector-1280x720.png') });
  await page.waitForURL(/demo-lab\.html$/, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('#dl-demo-name')?.value === 'ScreenReel in 90 seconds' && document.querySelector('#dl-audience')?.value === 'engineering-leaders' && document.querySelector('#dl-presenter-notes')?.checked && document.querySelector('#dl-pacing')?.value === '3', null, { timeout: 45000 });
  await page.waitForURL(/demo-lab-output\.html$/, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await visiblePill(page);
  await page.locator('[data-demo-id="doctor-output"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForURL(/\/action-showcase\/(index\.html)?$/, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await visiblePill(page); assert.equal(await page.locator('.sr-count').innerText(), '6/6');
  await page.screenshot({ path: path.join(output, 'projector-complete-1280x720.png') });
  await page.waitForURL(/\/action-showcase\/(index\.html)?$/, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' }); await visiblePill(page);
  await page.locator('button[data-cmd="studio"]').click(); const heading = page.getByRole('heading', { name: 'Studio flows', exact: true }); await heading.waitFor();
  // New flow uses an in-Studio form rather than a browser prompt: the action is visible, testable,
  // and cannot appear to do nothing when system dialogs are suppressed by the host browser.
  await page.getByRole('button', { name: 'New flow', exact: true }).click();
  await page.getByRole('heading', { name: 'Create flow', exact: true }).waitFor();
  await page.locator('[data-flow-name]').fill('Browser smoke empty flow');
  await page.getByRole('button', { name: 'Create flow', exact: true }).click();
  await page.getByRole('heading', { name: 'Browser smoke empty flow', exact: true }).waitFor();
  assert.equal(await page.locator('.sr-empty').count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Create first scene', exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Back to flows', exact: true }).innerText(), 'Back to flows');
  assert.deepEqual(pageErrors, [], 'creating an empty flow must not throw in Studio');
  await page.getByRole('button', { name: 'Back to flows', exact: true }).click();
  const emptyFlowRow = page.locator('.sr-flow-row').filter({ hasText: 'Browser smoke empty flow' });
  page.once('dialog', (dialog) => dialog.accept()); await emptyFlowRow.getByRole('button', { name: 'Delete', exact: true }).click();
  assert.equal(await page.locator('.sr-flow-row').filter({ hasText: 'Browser smoke empty flow' }).count(), 0);
  const showcaseRow = page.locator('.sr-flow-row').filter({ hasText: 'All actions showcase' }).first(); await showcaseRow.getByRole('button', { name: 'Duplicate', exact: true }).click();
  const localRow = page.locator('.sr-flow-row').filter({ hasText: 'All actions showcase copy' }); assert.equal(await localRow.count(), 1); await localRow.locator('.sr-flow-name').click();
  await page.getByRole('heading', { name: 'All actions showcase copy', exact: true }).waitFor(); assert.equal(await page.locator('.sr-scene-table tbody tr').count(), 4);
  // Adding a scene is a real create/cancel boundary: opening the dialog must not fork or dirty the
  // flow, and timing stays behind an explicit advanced disclosure for the common path.
  await page.getByRole('button', { name: 'Add scene', exact: true }).click();
  await page.getByRole('heading', { name: 'Create scene', exact: true }).waitFor();
  assert.equal(await page.locator('.sr-advanced').getAttribute('open'), null);
  assert.match(await page.locator('[data-save-status]').innerText(), /Draft saved locally/);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await page.locator('.sr-scene-table tbody tr').count(), 4);
  assert.match(await page.locator('[data-save-status]').innerText(), /Draft saved locally/);
  // Creating the scene lands in the focused Ready state; there is one preview iframe and no
  // timeline editing chrome competing with the primary recording action.
  await page.getByRole('button', { name: 'Add scene', exact: true }).click();
  await page.locator('[data-key="title"]').fill('Ready state check');
  await page.getByRole('button', { name: 'Create scene', exact: true }).click();
  assert.equal(await page.locator('[data-editor-phase="ready"]').count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Back to scenes', exact: true }).innerText(), 'Back to scenes');
  assert.equal(await page.locator('.sr-preview-frame').count(), 1);
  await page.getByRole('heading', { name: 'Press Start recording, then use your app', exact: true }).waitFor();
  await page.setViewportSize({ width: 1440, height: 900 }); await page.screenshot({ path: path.join(output, 'studio-ready-1440x900.png') });
  await page.getByRole('button', { name: 'Back to scenes', exact: true }).click();
  const readyRow = page.locator('.sr-scene-table tbody tr').filter({ hasText: 'Ready state check' });
  page.once('dialog', (dialog) => dialog.accept()); await readyRow.getByRole('button', { name: 'Delete scene', exact: true }).click();
  assert.equal(await page.locator('.sr-scene-table tbody tr').count(), 4);
  const editButtons = page.getByRole('button', { name: 'Edit', exact: true }); assert.equal(await editButtons.count(), 4); await editButtons.nth(0).click();
  // Scene settings live in a modal now, so the editor's height belongs to the preview. The route
  // block must resolve to a real URL: a wrong route is the one scene mistake that plays nothing.
  await page.locator('[data-settings]').click();
  await page.locator('[data-key="title"]').fill('Studio-authored highlight');
  assert.match(await page.locator('.sr-route-resolved').innerText(), /^http/);
  assert(await page.locator('[data-route-pick] option').count() > 1, 'the route picker should offer known pages');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.locator('.sr-modal').waitFor({ state: 'detached' });
  assert.equal(await page.locator('[data-editor-phase="review"]').count(), 1);
  await page.screenshot({ path: path.join(output, 'studio-review-1440x900.png') });
  // Reload means reset to the configured scene route, not refresh whichever page a previous
  // interaction happened to leave in the iframe. It must also restore preview isolation.
  const configuredPreviewSrc = await page.locator('.sr-preview-frame').getAttribute('src');
  await page.locator('.sr-preview-frame').evaluate((frame) => frame.contentWindow.history.replaceState({}, '', '/examples/action-showcase/destination.html'));
  await page.locator('[data-reload]').click();
  // Studio renders in a shadow root, so document.querySelector cannot see the frame; poll through a handle.
  const previewFrame = await page.locator('.sr-preview-frame').elementHandle();
  await page.waitForFunction(([frame, expected]) => frame.contentWindow.location.href.endsWith(expected), [previewFrame, configuredPreviewSrc]);
  assert.match(await page.locator('.sr-preview-frame').getAttribute('src'), /screenreelPreview=1/);
  // Review playback must explain itself: the button reports progress, the active action is
  // highlighted, and an explicit afterMs is shown before playback and counted down while it runs.
  const firstAction = page.locator('.sr-action').first();
  await firstAction.locator('[data-action-edit]').click();
  await page.locator('[data-key="afterMs"]').fill('2100');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.locator('.sr-modal').waitFor({ state: 'detached' });
  assert.match(await firstAction.locator('[data-action-wait]').innerText(), /Wait after · 2\.1s/);
  await page.locator('[data-play-scene]').click();
  await page.locator('.sr-action.is-running').waitFor({ state: 'visible' });
  assert.match(await page.locator('[data-play-label]').innerText(), /Playing · 1 of/);
  assert.equal(await firstAction.getAttribute('aria-current'), 'step');
  await firstAction.locator('[data-action-wait]').filter({ hasText: 'Waiting' }).waitFor({ state: 'visible', timeout: 10000 });
  assert.match(await firstAction.locator('[data-action-wait]').innerText(), /Waiting · [123]s/);
  await page.locator('[data-play-scene]').click();
  assert.equal(await page.locator('[data-play-label]').innerText(), 'Play scene');
  assert.equal(await page.locator('.sr-action.is-running').count(), 0);
  await page.locator('[data-timeline-head] [data-add-action]').click(); assert.equal(await page.locator('[data-definition]').count(), 26); assert.equal(await page.locator('[data-recipe]').count(), 6);
  await page.locator('[data-definition="highlight"]').click(); const preview = page.frameLocator('.sr-preview-frame'); const kpiValue = preview.locator('[data-kpi="revenue"] strong'); await kpiValue.click();
  const savedTarget = page.locator('.sr-action small').filter({ hasText: '[data-kpi="revenue"]' }); await savedTarget.waitFor(); assert.equal(await savedTarget.count(), 1);
  // Holding a modifier must OUTLINE what will be captured and name its match count before any
  // click — that preview is the whole feature, and its absence is what made ⌘-click land on the
  // wrong element. Meta rather than Control: Ctrl+click is a contextmenu on macOS.
  const stockKpi = preview.locator('[data-kpi="stock"] strong');
  await stockKpi.hover();
  await page.keyboard.down('Meta');
  const outline = preview.locator('.sr-selector-outline');
  await outline.waitFor({ state: 'visible' });
  assert.match(await preview.locator('.sr-selector-label').innerText(), /\[data-kpi="stock"\][\s\S]*1 match/);
  await stockKpi.click();
  await page.keyboard.up('Meta');
  await outline.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.sr-action').count(), 12);
  await page.locator('[data-save-status]').filter({ hasText: 'Draft saved locally' }).waitFor();
  // Voiceover is authored from the action's own row, and Studio writes the timing the line needs
  // into the flow — a paced hold is what stops the next action's line from cutting this one off.
  await page.locator('.sr-action').last().locator('[data-action-voice]').click();
  await page.locator('[data-key="narration"]').fill('Weeks of stock is the one to watch.');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.locator('.sr-modal').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.sr-action').last().locator('.sr-action-voice').count(), 1);
  await page.locator('[data-save-status]').filter({ hasText: 'Draft saved locally' }).waitFor();
  assert(await page.evaluate(() => JSON.parse(localStorage.getItem('screenreel:action-showcase:flows:v1')).flows.some((flow) => flow.scenes.some((scene) => scene.title === 'Studio-authored highlight' && scene.actions.length === 12))));
  // The paced hold is the point of writing timing into the flow rather than waiting at play time.
  assert(await page.evaluate(() => JSON.parse(localStorage.getItem('screenreel:action-showcase:flows:v1')).flows.some((flow) => flow.scenes.some((scene) => scene.actions.some((action) => action.narration === 'Weeks of stock is the one to watch.' && action.pace?.field === 'holdMs' && action.holdMs > action.pace.addedMs)))));
  // Record-by-doing: trusted interactions inside the preview iframe become actions incrementally,
  // without a re-render (the checkbox click must NOT double-emit alongside its toggle). The form
  // is scrolled into view BEFORE recording starts: Playwright's own scroll-into-view during the
  // clicks below is a real scroll the recorder would (correctly) capture, which would make the
  // action count depend on viewport layout instead of on the interactions under test.
  await preview.locator('#form').scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
  const recordButton = page.locator('[data-record]'); await recordButton.click();
  // Record explains itself before it starts. The voice toggle is deliberately inert, and ticking
  // the skip box persists the preference the same way the mute does.
  await page.locator('.sr-primer-list').waitFor();
  assert.equal(await page.locator('[data-record-voice]').isDisabled(), true);
  await page.locator('[data-record-skip]').check();
  await page.locator('[data-record-start]').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('screenreel:action-showcase:record-primer:v1')), '1');
  await page.locator('.sr-picker-banner').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-editor-phase="recording"]').count(), 1);
  assert.equal(await page.locator('[data-undo-recording]').count(), 1);
  await page.screenshot({ path: path.join(output, 'studio-recording-1440x900.png') });
  await preview.locator('#submit-control').click();
  await preview.locator('#customer-name').pressSequentially('Recorded Co', { delay: 40 });
  await preview.locator('#priority').check();
  // The same gesture mid-take, on an element the take already clicked normally: the highlight is
  // recorded and the click is swallowed, so the pair proves both commit paths stay distinguishable.
  await preview.locator('#submit-control').hover();
  await page.keyboard.down('Meta');
  await preview.locator('#submit-control').click();
  await page.keyboard.up('Meta');
  await page.locator('[data-stop-recording]').click();
  await page.locator('.sr-picker-banner').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.sr-action').count(), 16);
  assert.equal(await page.locator('.sr-action small').filter({ hasText: '#customer-name' }).count(), 1);
  await page.getByRole('button', { name: 'Finish scene', exact: true }).click();
  assert(await page.evaluate(() => JSON.parse(localStorage.getItem('screenreel:action-showcase:flows:v1')).flows.some((flow) => flow.scenes.some((scene) => scene.actions.length === 16 && scene.actions.some((action) => action.type === 'type' && action.text === 'Recorded Co')))));
  // Recorded through the coalescer (which stamps the fingerprint), and the swallowed ⌘-click left
  // exactly one real click on that button rather than a second one.
  assert(await page.evaluate(() => JSON.parse(localStorage.getItem('screenreel:action-showcase:flows:v1')).flows.some((flow) => flow.scenes.some((scene) => scene.actions.filter((action) => action.type === 'click' && action.selector === '#submit-control').length === 1 && scene.actions.some((action) => action.type === 'highlight' && action.selector === '#submit-control' && action.fingerprint)))));
  await page.getByRole('heading', { name: 'All actions showcase copy', exact: true }).waitFor(); assert.equal(await page.locator('.sr-scene-table tbody tr').filter({ hasText: 'Studio-authored highlight' }).count(), 1);
  await page.setViewportSize({ width: 1440, height: 900 }); await page.screenshot({ path: path.join(output, 'studio-1440x900.png') });
  await page.getByRole('button', { name: 'Play flow', exact: true }).click();
  await page.locator('.sr-studio').waitFor({ state: 'detached' });
  await page.locator('.sr-action-box,.sr-glow-box').waitFor({ state: 'visible', timeout: 5000 });
  // The landing's trimmed bar has no flow picker, so read the active flow from the projector.
  assert.equal(await page.evaluate(() => [...window.ScreenReel.instances][0].store.activeFlow().name), 'All actions showcase copy');
  await page.locator('button[title="Pause"]').click();
  // restoreOnExit: closing the landing tour mid-way — here from Demo Lab, a full navigation away —
  // returns the visitor to the landing, at the scroll position they started from.
  const returnPage = await browser.newPage({ viewport: { width: 1280, height: 720 } }); await silenceSpeech(returnPage);
  await returnPage.goto(`${baseUrl}?variant=repo-native`, { waitUntil: 'domcontentloaded' });
  await returnPage.waitForFunction(() => document.querySelector('#demo-button')?.dataset.landingReady === 'true');
  await returnPage.evaluate(() => scrollTo(0, 120)); await returnPage.waitForFunction(() => scrollY === 120);
  await returnPage.getByRole('button', { name: 'Run the live demo' }).click(); await returnPage.locator('[data-choose="guided"]').click();
  // Scene 1 has two cards (the badge, then the statement) before it navigates to Demo Lab.
  await returnPage.locator('.sr-callout-step', { hasText: '1 of' }).waitFor(); await returnPage.locator('.sr-callout-next').click();
  await returnPage.locator('.sr-callout-step', { hasText: '2 of' }).waitFor(); await returnPage.locator('.sr-callout-next').click();
  await returnPage.waitForURL(/demo-lab\.html$/, { waitUntil: 'domcontentloaded' }); await returnPage.locator('.sr-callout-next').waitFor();
  await returnPage.keyboard.press('Escape');
  await returnPage.waitForURL(/\/action-showcase\/\?variant=repo-native$/, { waitUntil: 'load' });
  await returnPage.waitForFunction(() => scrollY === 120, null, { timeout: 5000 });
  assert.equal(await returnPage.evaluate(() => !!document.querySelector('.sr-pill, .sr-click-shield, .sr-action-callout')), false, 'the tour is fully closed after returning');
  await returnPage.close();
  // Showcase journey on the new player: Guided shows a card per chapter across pages, Esc returns to
  // the page the journey started on, and the one-chapter demos play straight away in Autoplay.
  const showcasePage = await browser.newPage({ viewport: { width: 1280, height: 720 } }); await silenceSpeech(showcasePage);
  await showcasePage.goto(new URL('showcase.html', baseUrl).href, { waitUntil: 'domcontentloaded' });
  await showcasePage.waitForFunction(() => document.querySelector('#sc-journey-button')?.hasAttribute('aria-pressed'));
  await showcasePage.locator('#sc-journey-button').click(); await showcasePage.locator('[data-choose="guided"]').click();
  await showcasePage.locator('.sr-callout-next').waitFor({ timeout: 15000 });
  assert.equal(await showcasePage.locator('.sr-callout-title').innerText(), 'The journey of a demo');
  assert.equal(await showcasePage.locator('.sr-callout-step').innerText(), '1 of 7');
  assert.equal(await showcasePage.locator('.sr-toast:visible').count(), 0, 'guided tours show no note toasts');
  await showcasePage.locator('.sr-callout-next').click();
  await showcasePage.waitForURL(/showcase-create\.html$/); await showcasePage.locator('.sr-callout-next').waitFor({ timeout: 15000 });
  assert.equal(await showcasePage.locator('.sr-callout-title').innerText(), 'Perform it once');
  await showcasePage.keyboard.press('Escape');
  await showcasePage.waitForURL(/\/showcase\.html$/, { waitUntil: 'load' });
  await showcasePage.goto(new URL('showcase-branch.html', baseUrl).href, { waitUntil: 'domcontentloaded' });
  await showcasePage.waitForFunction(() => document.querySelector('#sc-journey-button')?.hasAttribute('aria-pressed'));
  await showcasePage.locator('[data-sc="branch"]').click();
  await showcasePage.locator('.sr-choice-card, .sr-glow-box').first().waitFor({ timeout: 15000 });
  assert.equal(await showcasePage.locator('.sr-chooser').count(), 0, 'one-chapter demos skip the chooser');
  await showcasePage.close();
  const spaPage = await browser.newPage({ viewport: { width: 1280, height: 720 } }); await spaPage.goto(new URL('../spa-router/', baseUrl).href, { waitUntil: 'domcontentloaded' });
  const spaTrigger = spaPage.locator('#demo-button'); await spaTrigger.waitFor(); await spaPage.waitForFunction(() => document.querySelector('#demo-button')?.hasAttribute('aria-pressed')); await spaTrigger.click(); await visiblePill(spaPage);
  await spaPage.locator('button[title="Play"]').click(); await spaPage.locator('.sr-glow-box').waitFor({ state: 'visible', timeout: 5000 });
  await spaPage.locator('button[title="Next scene"]').click(); await spaPage.waitForURL(/view=details/); await spaPage.locator('.sr-glow-box').waitFor({ state: 'visible', timeout: 5000 });
  assert.match(spaPage.url(), /view=details/); await spaPage.locator('button[title="Pause"]').click(); await spaPage.close();
  const inlinePage = await browser.newPage({ viewport: { width: 1280, height: 720 } }); await inlinePage.goto(new URL('../inline-flow/', baseUrl).href, { waitUntil: 'domcontentloaded' }); const inlineTrigger = inlinePage.locator('#demo-button'); await inlineTrigger.waitFor(); await inlinePage.waitForFunction(() => document.querySelector('#demo-button')?.hasAttribute('aria-pressed')); await inlineTrigger.click(); const inlinePill = await visiblePill(inlinePage); assert.equal(await inlinePill.count(), 1);
  const contracts = await inlinePage.evaluate(async () => {
    const target = document.createElement('button'); target.id = 'strict-demo'; document.body.appendChild(target);
    const projector = await window.ScreenReel.mount(target, { projectId: 'strict-example', strict: true, loop: false, routesEqual: (current, scene) => current.includes('/inline-flow/') && scene === '/legacy.html', flow: { data: { schemaVersion: 1, flows: [{ id: 'strict', name: 'Strict', scenes: [{ id: 'missing', route: '/legacy.html', actions: [{ type: 'highlight', selector: '#does-not-exist' }] }] }] } } });
    const report = projector.validateScene(); projector.enable(); await projector.play(); const playing = projector.store.playing(); const matched = projector.routeMatches({ route: '/legacy.html' }); projector.destroy(); target.remove();
    return { report, playing, matched, capture: typeof projector.captureCurrent };
  });
  // The pill no longer offers capture, but the method behind it is still part of the API.
  assert.equal(contracts.capture, 'function');
  assert.equal(contracts.matched, true); assert.equal(contracts.report.ok, false); assert.equal(contracts.report.actions[0].errors[0], 'selector has no matches'); assert.equal(contracts.playing, false);
  // Guided advance: a finished scene waits for Next (pulsing it) instead of the dwell timer, and
  // Next on the last scene of a non-looping flow completes the tour. Highlights dim the page.
  const guided = await inlinePage.evaluate(async () => {
    const target = document.createElement('button'); target.id = 'guided-demo'; document.body.appendChild(target);
    const spot = document.createElement('div'); spot.id = 'guided-spot'; spot.textContent = 'Guided target'; document.body.appendChild(spot);
    const projector = await window.ScreenReel.mount(target, { projectId: 'guided-example', advance: 'guided', loop: false, narration: false, cursor: false, routesEqual: () => true, flow: { data: { schemaVersion: 1, flows: [{ id: 'guided', name: 'Guided', defaults: { dwellMs: 50 }, scenes: [{ id: 'one', route: '/', actions: [{ type: 'callout', selector: '#guided-spot', text: 'One', holdMs: 300 }] }, { id: 'two', route: '/', actions: [{ type: 'callout', selector: '#guided-spot', text: 'Two', holdMs: 300 }] }] }] } } });
    const once = (name) => new Promise((resolve) => addEventListener(`screenreel:${name}`, (event) => resolve(event.detail), { once: true }));
    let dimmed = false; const observer = new MutationObserver(() => { if (document.querySelector('.sr-dim-backdrop')) dimmed = true; }); observer.observe(document.body, { childList: true, subtree: true }); // overlays live inside the tour layer
    projector.enable(); const firstWait = once('awaitingnext'); projector.play(); const first = await firstWait;
    await new Promise((resolve) => setTimeout(resolve, 300)); // a dwell timer would have advanced by now
    const heldPosition = projector.store.position(); const pulsing = !!projector.pill.querySelector('[data-cmd="next"].sr-await-next');
    const secondWait = once('awaitingnext'); projector.command('next'); const second = await secondWait;
    const completed = once('complete'); projector.command('next'); await completed;
    observer.disconnect(); projector.destroy(); target.remove(); spot.remove();
    return { first: first.sceneId, second: second.sceneId, heldPosition, pulsing, dimmed, playingAfter: projector.store.playing() };
  });
  assert.deepEqual(guided, { first: 'one', second: 'two', heldPosition: 0, pulsing: true, dimmed: true, playingAfter: false });
  // Guided onboarding (the ms-ui contract): the final highlight + callout stay up until Next, the
  // callout carries Back/Next, keys drive the tour, Back plays the previous scene, scene cleanup
  // undoes app changes whatever ends the scene, and start()/exit/disableOnComplete/play() behave.
  const onboarding = await inlinePage.evaluate(async () => {
    const target = document.createElement('button'); target.id = 'onboarding-demo'; document.body.appendChild(target);
    const spot = document.createElement('div'); spot.id = 'onboarding-spot'; spot.textContent = 'Onboarding target'; document.body.appendChild(spot);
    const scene = (id, extra = {}) => ({ id, route: '/', actions: [{ type: 'callout', selector: '#onboarding-spot', title: `Title ${id}`, text: `Body ${id}`, highlight: true, holdMs: 200 }], ...extra });
    const flow = { id: 'onboarding', name: 'Onboarding', defaults: { dwellMs: 50, advance: 'guided' }, scenes: [
      scene('one', { actions: [{ type: 'call', fn: 'onboardingDark', args: [] }, { type: 'callout', selector: '#onboarding-spot', title: 'Title one', text: 'Body one', highlight: true, holdMs: 200 }], cleanup: [{ type: 'call', fn: 'onboardingLight', args: [] }] }),
      scene('two'), scene('three'),
    ] };
    const unregister = [window.ScreenReel.registerFn('onboardingDark', () => document.body.classList.add('onboarding-dark')), window.ScreenReel.registerFn('onboardingLight', () => document.body.classList.remove('onboarding-dark'))];
    const warnings = []; const warn = console.warn; console.warn = (...args) => { warnings.push(args.join(' ')); warn(...args); };
    const once = (name) => new Promise((resolve) => addEventListener(`screenreel:${name}`, (event) => resolve(event.detail), { once: true }));
    const settle = () => new Promise((resolve) => setTimeout(resolve, 150));
    const projector = await window.ScreenReel.mount(target, { projectId: 'onboarding-example', loop: false, narration: false, cursor: false, disableOnComplete: true, routesEqual: () => true, flow: { data: { schemaVersion: 1, flows: [flow] } } });
    const result = {};
    let waiting = once('awaitingnext'); await projector.start('onboarding'); await waiting;
    const callout = () => document.querySelector('.sr-action-callout');
    result.heldOnScreen = { callout: !!callout(), ring: !!document.querySelector('.sr-glow-box'), dim: !!document.querySelector('.sr-dim-backdrop'), title: callout()?.querySelector('.sr-callout-title')?.textContent, buttons: [...(callout()?.querySelectorAll('button') || [])].map((button) => button.textContent) };
    result.appChangedDuringScene = document.body.classList.contains('onboarding-dark');
    const before = projector.store.playing(); await projector.play(); result.replayRefused = before && warnings.some((line) => line.includes('play() ignored'));
    waiting = once('awaitingnext'); callout().querySelector('.sr-callout-next').click(); const second = await waiting;
    result.nextFromCallout = second.sceneId; result.cleanupRanOnNext = !document.body.classList.contains('onboarding-dark');
    result.backOffered = [...callout().querySelectorAll('button')].map((button) => button.textContent);
    waiting = once('awaitingnext'); document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); result.arrowRight = (await waiting).sceneId;
    result.lastLabel = callout().querySelector('.sr-callout-next').textContent;
    waiting = once('awaitingnext'); document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); result.arrowLeftPlays = (await waiting).sceneId;
    const exit = once('exit'); waiting = once('awaitingnext'); callout().querySelector('.sr-callout-next').click(); await waiting;
    callout().querySelector('.sr-callout-next').click(); const exitDetail = await exit; await settle();
    result.finish = { reason: exitDetail.reason, sceneId: exitDetail.sceneId, enabledAfter: projector.store.enabled(), overlaysLeft: document.querySelectorAll('.sr-action-callout,.sr-glow-box,.sr-dim-backdrop').length };
    // Exit mid-scene still runs cleanup and reports a user skip.
    waiting = once('awaitingnext'); await projector.start('onboarding', { position: 0 }); await waiting;
    const skip = once('exit'); document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); result.escape = (await skip).reason; await settle();
    result.cleanupRanOnExit = !document.body.classList.contains('onboarding-dark');
    try { await projector.start('missing'); result.unknownFlow = 'no error'; } catch (error) { result.unknownFlow = error.message; }
    console.warn = warn; unregister.forEach((fn) => fn()); projector.destroy(); target.remove(); spot.remove();
    return result;
  });
  assert.deepEqual(onboarding, {
    heldOnScreen: { callout: true, ring: true, dim: true, title: 'Title one', buttons: ['Skip tour', 'Next'] },
    appChangedDuringScene: true, replayRefused: true,
    nextFromCallout: 'two', cleanupRanOnNext: true, backOffered: ['Skip tour', 'Back', 'Next'],
    arrowRight: 'three', lastLabel: 'Finish', arrowLeftPlays: 'two',
    finish: { reason: 'complete', sceneId: 'three', enabledAfter: false, overlaysLeft: 0 },
    escape: 'user', cleanupRanOnExit: true, unknownFlow: 'ScreenReel start(): unknown flow "missing"',
  });
  // Guide surface (ms-ui's player, folded into the Projector): chooser, mid-scene callout steps with
  // "N of M" and Skip, a hidden pill in guided mode, a click shield that stops real viewer clicks,
  // callouts that follow a moving target, a minimal centred autoplay bar, and strict `functions`.
  await inlinePage.evaluate(async () => {
    const toggle = document.createElement('button'); toggle.id = 'guide-toggle'; toggle.textContent = 'Theme'; toggle.style.cssText = 'position:fixed;left:40px;top:320px;width:120px;height:40px';
    toggle.onclick = () => document.body.classList.toggle('guide-dark'); document.body.appendChild(toggle);
    const target = document.createElement('button'); target.id = 'guide-demo'; document.body.appendChild(target);
    window.__guideGlobal = () => { window.__guideGlobalCalled = true; };
    const flow = { id: 'guide', name: 'Getting started', defaults: { dwellMs: 50 }, scenes: [
      { id: 'theme', route: '/', actions: [{ type: 'click', selector: '#guide-toggle' }, { type: 'callout', selector: '#guide-toggle', title: 'Theme', text: 'Switch it here', placement: 'right', holdMs: 150 }, { type: 'click', selector: '#guide-toggle' }] },
      { id: 'globals', route: '/', actions: [{ type: 'call', fn: '__guideGlobal', args: [] }, { type: 'callout', selector: '#guide-toggle', text: 'Last step', holdMs: 150 }] },
    ] };
    window.__guideEvents = []; for (const name of ['awaitingnext', 'exit']) addEventListener(`screenreel:${name}`, (event) => window.__guideEvents.push([name, event.detail.sceneId, event.detail.actionIndex ?? event.detail.reason]));
    window.__guide = await window.ScreenReel.mount(target, { projectId: 'guide-example', loop: false, narration: false, cursor: false, chooser: true, studio: false, position: 'center', controls: { guided: [], auto: ['prev', 'play', 'next', 'exit'] }, functions: {}, labels: { stepOf: (step, total) => `Step ${step} of ${total}` }, routesEqual: () => true, flow: { data: { schemaVersion: 1, flows: [flow] } } });
    window.__guideStart = window.__guide.start('guide');
  });
  const guideShadow = (selector) => inlinePage.locator(`#screenreel-projector-guide-example ${selector}`);
  await guideShadow('.sr-chooser').waitFor();
  const chooserText = await guideShadow('.sr-chooser').innerText();
  await guideShadow('[data-choose="guided"]').click();
  await inlinePage.waitForFunction(() => window.__guideEvents.some(([name]) => name === 'awaitingnext'));
  const stepState = await inlinePage.evaluate(() => ({
    toggled: document.body.classList.contains('guide-dark'),
    step: document.querySelector('.sr-callout-step')?.textContent,
    buttons: [...document.querySelectorAll('.sr-callout-actions button')].map((button) => button.textContent),
    pillHidden: document.querySelector('#screenreel-projector-guide-example').shadowRoot.querySelector('.sr-pill').hidden,
    shield: !!document.querySelector('.sr-click-shield'), side: document.querySelector('.sr-action-callout').dataset.side,
  }));
  // A real viewer click on the app mid-tour lands on the shield, not on the toggle.
  const toggleBox = await inlinePage.locator('#guide-toggle').boundingBox();
  await inlinePage.mouse.click(toggleBox.x + toggleBox.width / 2, toggleBox.y + toggleBox.height / 2);
  const afterStrayClick = await inlinePage.evaluate(() => document.body.classList.contains('guide-dark'));
  // The callout follows its target when the page moves it.
  const followed = await inlinePage.evaluate(async () => {
    const before = parseFloat(document.querySelector('.sr-action-callout').style.top);
    document.querySelector('#guide-toggle').style.top = '420px';
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return parseFloat(document.querySelector('.sr-action-callout').style.top) - before;
  });
  const secondStep = await inlinePage.evaluate(async () => {
    const waiting = new Promise((resolve) => addEventListener('screenreel:awaitingnext', (event) => resolve(event.detail), { once: true }));
    document.querySelector('.sr-callout-next').click(); const detail = await waiting;
    return { sceneId: detail.sceneId, undone: !document.body.classList.contains('guide-dark'), globalBlocked: !window.__guideGlobalCalled, nextLabel: document.querySelector('.sr-callout-next').textContent, step: document.querySelector('.sr-callout-step').textContent };
  });
  const skipped = await inlinePage.evaluate(async () => {
    const exit = new Promise((resolve) => addEventListener('screenreel:exit', (event) => resolve(event.detail), { once: true }));
    document.querySelector('.sr-callout-skip').click(); const detail = await exit;
    return { reason: detail.reason, shieldGone: !document.querySelector('.sr-click-shield'), overlays: document.querySelectorAll('.sr-action-callout,.sr-glow-box,.sr-dim-backdrop').length };
  });
  // Autoplay with a mode skips the chooser and shows only the minimal, centred bar.
  const autoplay = await inlinePage.evaluate(async () => {
    await window.__guide.start('guide', { mode: 'auto' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const root = document.querySelector('#screenreel-projector-guide-example').shadowRoot;
    const result = { chooser: !root.querySelector('.sr-chooser-layer').hidden, controls: [...root.querySelectorAll('.sr-pill [data-cmd]')].map((button) => button.dataset.cmd), centred: root.querySelector('.sr-pill').classList.contains('sr-pill--center') };
    window.__guide.destroy(); document.querySelector('#guide-toggle').remove(); document.querySelector('#guide-demo').remove(); delete window.__guideGlobal;
    return result;
  });
  assert.match(chooserText, /Getting started[\s\S]*Guided[\s\S]*Autoplay/);
  assert.deepEqual(stepState, { toggled: true, step: 'Step 1 of 2', buttons: ['Skip tour', 'Next'], pillHidden: true, shield: true, side: 'right' });
  assert.equal(afterStrayClick, true, 'the click shield must stop a real viewer click from toggling the app');
  assert.equal(followed, 100, 'the callout follows its target');
  assert.deepEqual(secondStep, { sceneId: 'globals', undone: true, globalBlocked: true, nextLabel: 'Finish', step: 'Step 2 of 2' });
  assert.deepEqual(skipped, { reason: 'user', shieldGone: true, overlays: 0 });
  assert.deepEqual(autoplay, { chooser: false, controls: ['prev', 'play', 'next', 'exit'], centred: true });
  // The shield sits under the player controls and only stops the viewer: the tour's own type, hover,
  // drag, and click dispatch straight to their targets while it is up; a real viewer drag does not.
  await inlinePage.evaluate(async () => {
    const make = (tag, id, css) => { const node = document.createElement(tag); node.id = id; node.style.cssText = css; document.body.appendChild(node); return node; };
    const seen = window.__shieldSeen = { typed: '', hovered: false, dragStarted: 0, dragMoves: 0, clicked: false };
    make('input', 'shield-input', 'position:fixed;left:40px;top:120px;width:160px').addEventListener('input', (event) => { seen.typed = event.target.value; });
    const card = make('div', 'shield-card', 'position:fixed;left:40px;top:180px;width:120px;height:60px;background:#eee');
    card.addEventListener('mouseover', () => { seen.hovered = true; }); card.addEventListener('pointerdown', () => { seen.dragStarted += 1; });
    addEventListener('pointermove', () => { if (seen.dragStarted) seen.dragMoves += 1; });
    make('div', 'shield-drop', 'position:fixed;left:400px;top:180px;width:120px;height:60px;background:#ddd');
    make('button', 'shield-button', 'position:fixed;left:40px;top:260px').addEventListener('click', () => { seen.clicked = true; });
    const trigger = make('button', 'shield-demo', '');
    const flow = { id: 'shielded', name: 'Shielded', scenes: [{ id: 'act', route: '/', dwellMs: 60000, actions: [{ type: 'type', selector: '#shield-input', text: 'hi', charMs: 10 }, { type: 'hover', selector: '#shield-card', holdMs: 50 }, { type: 'drag', selector: '#shield-card', toSelector: '#shield-drop', durMs: 150 }, { type: 'click', selector: '#shield-button' }] }] };
    window.__shielded = await window.ScreenReel.mount(trigger, { projectId: 'shield-example', loop: false, narration: false, cursor: false, routesEqual: () => true, flow: { data: { schemaVersion: 1, flows: [flow] } } });
    await window.__shielded.start('shielded');
  });
  await inlinePage.waitForFunction(() => window.__shieldSeen.clicked, null, { timeout: 10000 });
  const tourActions = await inlinePage.evaluate(() => ({ ...window.__shieldSeen, dragMoves: window.__shieldSeen.dragMoves > 0, shield: !!document.querySelector('.sr-click-shield') }));
  await inlinePage.evaluate(() => { window.__shieldSeen.dragStarted = 0; window.__shieldSeen.dragMoves = 0; });
  const cardBox = await inlinePage.locator('#shield-card').boundingBox();
  await inlinePage.mouse.move(cardBox.x + 20, cardBox.y + 20); await inlinePage.mouse.down(); await inlinePage.mouse.move(cardBox.x + 300, cardBox.y + 20); await inlinePage.mouse.up();
  const viewerDrag = await inlinePage.evaluate(() => { const started = window.__shieldSeen.dragStarted; window.__shielded.destroy(); ['shield-input', 'shield-card', 'shield-drop', 'shield-button', 'shield-demo'].forEach((id) => document.getElementById(id).remove()); return started; });
  assert.deepEqual(tourActions, { typed: 'hi', hovered: true, dragStarted: 1, dragMoves: true, clicked: true, shield: true });
  assert.equal(viewerDrag, 0, 'a real viewer drag must land on the shield');
  // ms-ui's regressions against 055b16d: every guided callout waits (and is counted), a scene with no
  // callout plays through instead of stalling behind a hidden pill, a choice after a callout still
  // shows, and Next on the last scene of a non-looping flow completes rather than wrapping.
  const msui = await inlinePage.evaluate(async () => {
    const spot = document.createElement('div'); spot.id = 'msui-spot'; spot.textContent = 'ms-ui target'; document.body.appendChild(spot);
    const target = document.createElement('button'); target.id = 'msui-demo'; document.body.appendChild(target);
    const callout = (text) => ({ type: 'callout', selector: '#msui-spot', text, holdMs: 5000 });
    const flow = { id: 'msui', name: 'ms-ui', defaults: { dwellMs: 50 }, scenes: [
      { id: 'welcome', route: '/', actions: [{ type: 'countdown', from: 1, stepMs: 200 }] },
      { id: 'pair', route: '/', actions: [callout('first'), callout('second')] },
      { id: 'branch', route: '/', actions: [callout('pick'), { type: 'choice', prompt: 'Where next?', options: [{ label: 'Finish', scene: 'last' }], timeoutMs: 0 }] },
      { id: 'skipped', route: '/', actions: [callout('never shown')] },
      { id: 'last', route: '/', actions: [callout('done')] },
    ] };
    const events = []; for (const name of ['awaitingnext', 'choice', 'complete', 'exit']) addEventListener(`screenreel:${name}`, (event) => events.push(`${name}:${event.detail.sceneId}${name === 'exit' ? ':' + event.detail.reason : ''}`));
    const until = (predicate) => new Promise((resolve) => { const check = () => (predicate() ? resolve() : setTimeout(check, 25)); check(); });
    const steps = () => events.filter((item) => item.startsWith('awaitingnext')).length;
    const projector = await window.ScreenReel.mount(target, { projectId: 'msui-example', loop: false, narration: false, cursor: false, disableOnComplete: true, controls: { guided: [] }, routesEqual: () => true, flow: { data: { schemaVersion: 1, flows: [flow] } } });
    await projector.start('msui', { mode: 'guided' });
    await until(() => steps() === 1); const counters = [document.querySelector('.sr-callout-step').textContent];
    document.querySelector('.sr-callout-next').click(); await until(() => steps() === 2); counters.push(document.querySelector('.sr-callout-step').textContent);
    document.querySelector('.sr-callout-next').click(); await until(() => steps() === 3);
    document.querySelector('.sr-callout-next').click(); await until(() => document.querySelector('.sr-choice-card'));
    document.querySelector('.sr-choice-card').click(); await until(() => steps() === 4);
    document.querySelector('.sr-callout-next').click(); await until(() => events.some((item) => item.startsWith('exit')));
    const result = { counters, events, shield: !!document.querySelector('.sr-click-shield'), enabled: projector.store.enabled() };
    projector.destroy(); spot.remove(); target.remove(); return result;
  });
  assert.deepEqual(msui, {
    counters: ['1 of 5', '2 of 5'],
    events: ['awaitingnext:pair', 'awaitingnext:pair', 'awaitingnext:branch', 'choice:branch', 'awaitingnext:last', 'complete:last', 'exit:last:complete'],
    shield: false, enabled: false,
  });
  // Top layer: a host modal <dialog> opened by the tour must not cover the next callout — its Next
  // button stays clickable (the tour layer moves into the open modal and is re-raised).
  await inlinePage.evaluate(async () => {
    const dialog = document.createElement('dialog'); dialog.id = 'host-modal'; dialog.style.cssText = 'width:80vw;height:80vh'; dialog.textContent = 'Choose a module'; document.body.appendChild(dialog);
    const target = document.createElement('button'); target.id = 'modal-demo'; document.body.appendChild(target);
    window.ScreenReel.registerFn('openHostModal', () => dialog.showModal());
    const flow = { id: 'modal', name: 'Modal', scenes: [{ id: 'm', route: '/', actions: [{ type: 'call', fn: 'openHostModal', args: [] }, { type: 'callout', selector: '#host-modal', text: 'Pick a module', placement: 'auto' }] }] };
    window.__modalTour = await window.ScreenReel.mount(target, { projectId: 'modal-example', loop: false, narration: false, cursor: false, routesEqual: () => true, flow: { data: { schemaVersion: 1, flows: [flow] } } });
    await window.__modalTour.start('modal', { mode: 'guided' });
  });
  await inlinePage.locator('.sr-callout-next').waitFor();
  await inlinePage.locator('.sr-callout-next').click({ timeout: 3000 }); // a real click: fails if the modal covers it
  await inlinePage.waitForFunction(() => !window.__modalTour.store.playing() || !document.querySelector('.sr-callout-next'));
  await inlinePage.evaluate(() => { window.__modalTour.destroy(); document.getElementById('host-modal').close(); document.getElementById('host-modal').remove(); document.getElementById('modal-demo').remove(); });
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
  const darkContext = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1440, height: 900 } }); const darkPage = await darkContext.newPage(); await darkPage.goto(baseUrl, { waitUntil: 'domcontentloaded' }); const darkTrigger = darkPage.locator('#demo-button'); await darkTrigger.waitFor(); await darkPage.waitForFunction(() => document.querySelector('#demo-button')?.hasAttribute('aria-pressed')); await darkTrigger.click(); await darkPage.locator('[data-choose="auto"]').click(); const lightPill = await visiblePill(darkPage); await darkPage.waitForFunction(() => getComputedStyle(document.documentElement).backgroundColor === 'rgb(255, 255, 255)'); assert.match(await lightPill.evaluate((node) => getComputedStyle(node).backgroundColor), /rgba?\(255, 255, 255/); await darkPage.locator('button[data-cmd="studio"]').click(); await darkPage.locator('.sr-studio').waitFor(); assert.equal(await darkPage.locator('.sr-studio').evaluate((node) => getComputedStyle(node).backgroundColor), 'rgb(247, 247, 248)'); await darkPage.screenshot({ path: path.join(output, 'studio-light-under-dark-os-1440x900.png') }); await darkContext.close();
  // Share mode: ?demo=play auto-plays with viewer chrome only, and analytics events fire with a
  // stable session id. Fresh context so presenter-mode session state can't leak in.
  const shareContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const sharePage = await shareContext.newPage();
  await sharePage.addInitScript(() => { window.__analyticsEvents = []; addEventListener('screenreel:analytics', (e) => window.__analyticsEvents.push(e.detail)); });
  await sharePage.goto(`${baseUrl}?demo=play`, { waitUntil: 'domcontentloaded' });
  const sharePill = await visiblePill(sharePage);
  assert.equal(await sharePill.evaluate((node) => node.classList.contains('sr-pill--share')), true);
  assert.equal(await sharePage.locator('.sr-flow').count(), 0);
  assert.equal(await sharePage.locator('button[data-cmd="studio"]').count(), 0);
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
  // Studio's review timeline leaves the product preview about 738px wide. Keep the opening compact
  // there: the badge should not float inside desktop-scale whitespace in a short authoring canvas.
  const studioPreviewPage = await browser.newPage({ viewport: { width: 738, height: 796 } });
  await studioPreviewPage.goto(`${baseUrl}?variant=repo-native&screenreelPreview=1`, { waitUntil: 'domcontentloaded' });
  const compactHero = await studioPreviewPage.evaluate(() => {
    const topbar = document.querySelector('.landing-topbar'); const hero = document.querySelector('.landing-hero--repo'); const pill = document.querySelector('.open-source-pill'); const title = document.querySelector('.landing-hero h1');
    return { topbarHeight: topbar.getBoundingClientRect().height, heroPaddingTop: parseFloat(getComputedStyle(hero).paddingTop), pillGap: title.getBoundingClientRect().top - pill.getBoundingClientRect().bottom, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
  assert(compactHero.topbarHeight <= 60, JSON.stringify(compactHero)); assert(compactHero.heroPaddingTop <= 24, JSON.stringify(compactHero)); assert(compactHero.pillGap <= 20, JSON.stringify(compactHero)); assert.equal(compactHero.overflow, false, JSON.stringify(compactHero));
  await studioPreviewPage.screenshot({ path: path.join(output, 'landing-studio-preview-738x796.png'), fullPage: true }); await studioPreviewPage.close();
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
