/* Capture a screenshot of the live ScreenReel Studio overlay for the guided tour's reveal effect.
   Requires the example server running: `npm run example:serve` (http://127.0.0.1:4173). */
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'examples/action-showcase/studio-shot.png');
const url = process.env.BASE_URL || 'http://127.0.0.1:4173/examples/action-showcase/index.html';
const chromePath = process.env.CHROME_PATH || undefined;

const browser = await chromium.launch(chromePath ? { executablePath: chromePath } : { channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const api = await window.ScreenReel.ready;
    const instance = [...api.instances][0];
    instance.enable();
    await instance.openStudio();
  });
  await page.waitForTimeout(900);
  // Open the first flow so the screenshot shows the scene table, not just the flow list.
  await page.evaluate(() => {
    const rows = [];
    const scan = (node) => { node.querySelectorAll?.('.sr-flow-row').forEach((r) => rows.push(r)); node.querySelectorAll?.('*').forEach((el) => { if (el.shadowRoot) scan(el.shadowRoot); }); };
    scan(document);
    (rows[0]?.querySelector('.sr-flow-name') || rows[0])?.click();
  });
  await page.waitForTimeout(1300);
  await page.screenshot({ path: out });
  console.log(`wrote ${out}`);
} finally {
  await browser.close();
}
