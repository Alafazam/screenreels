/* Render the social card (og-image.png) and app icon (apple-touch-icon.png) from the ScreenReel brand mark. */
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'examples/action-showcase');
const chromePath = process.env.CHROME_PATH || undefined;

const MARK = `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#25C9B0"/><stop offset="0.55" stop-color="#22A7D6"/><stop offset="1" stop-color="#2E6BF0"/>
  </linearGradient></defs>
  <path d="M60,40 C60,16 24,16 24,40 C24,64 60,64 60,40 C60,16 96,16 96,40 C96,64 60,64 60,40 Z"
    fill="none" stroke="url(#g)" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const ogHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;box-sizing:border-box}html,body{width:1200px;height:630px}
  body{font-family:Inter,-apple-system,system-ui,sans-serif;background:#fff;color:#18181b;
    padding:76px 80px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden}
  body::after{content:"";position:absolute;right:-160px;top:-160px;width:620px;height:620px;border-radius:50%;
    background:radial-gradient(circle at 30% 30%,rgba(46,107,240,.10),rgba(37,201,176,.06) 55%,transparent 70%)}
  .brand{display:flex;align-items:center;gap:18px}
  .brand svg{width:78px;height:52px}
  .brand b{font-size:44px;font-weight:800;letter-spacing:-.02em}
  .eyebrow{color:#7c3aed;font-weight:800;letter-spacing:.14em;font-size:20px;text-transform:uppercase;margin-top:44px}
  h1{font-size:78px;line-height:1.02;letter-spacing:-.045em;font-weight:800;max-width:1000px;margin-top:18px}
  .foot{display:flex;justify-content:space-between;align-items:center;font-size:24px}
  .foot .url{color:#71717a;font-weight:600}.foot .tags{color:#18181b;font-weight:700}
  .foot .tags span{color:#d4d4d8;margin:0 10px}
</style></head><body>
  <div class="brand">${MARK}<b>ScreenReel</b></div>
  <div><div class="eyebrow">Open-source product demo toolkit</div>
    <h1>One flow for live demos and polished video.</h1></div>
  <div class="foot"><span class="url">alafazam.com/screenreels</span>
    <span class="tags">Projector<span>·</span>Studio<span>·</span>Capture</span></div>
</body></html>`;

const iconHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;box-sizing:border-box}html,body{width:180px;height:180px}
  body{background:#fff;display:grid;place-items:center}svg{width:132px;height:88px}
</style></head><body>${MARK}</body></html>`;

const browser = await chromium.launch(chromePath ? { executablePath: chromePath } : { channel: 'chrome' });
try {
  const p1 = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await p1.setContent(ogHtml, { waitUntil: 'networkidle' });
  await p1.screenshot({ path: path.join(out, 'og-image.png') });
  console.log('wrote og-image.png (1200x630)');

  const p2 = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
  await p2.setContent(iconHtml, { waitUntil: 'networkidle' });
  await p2.screenshot({ path: path.join(out, 'apple-touch-icon.png') });
  console.log('wrote apple-touch-icon.png (180x180)');
} finally {
  await browser.close();
}
