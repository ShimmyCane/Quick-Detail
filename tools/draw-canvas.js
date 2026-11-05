// Draws drawing specs into the Quick Detail canvas (the app itself, in headless Chromium) and saves a screenshot of each.
//
//   node tools/draw-canvas.js <spec.json> [<spec.json> ...] --out <folder>
//
// Each spec is passed to window.QuickDetail.draw(), the same path as "Create detail" in the JSON panel, so the
// spec is checked by SK.authorDetail and opened as a new detail. The view is fitted to the drawing, then a PNG is
// saved as <folder>/<spec name>.png. Exits 1 if any spec fails to draw or the page throws.
// Needs Playwright (preinstalled in the cloud container). Does not write to the cloud.
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const oi = args.indexOf('--out');
if (oi < 0 || !args[oi + 1]) { console.error('usage: node tools/draw-canvas.js <spec.json>... --out <folder>'); process.exit(2); }
const outDir = path.resolve(args[oi + 1]);
const specs = args.filter((a, i) => a.endsWith('.json') && i !== oi + 1).map(a => path.resolve(a));
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  let failed = false;
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  for (const file of specs) {
    const text = fs.readFileSync(file, 'utf8');
    const r = await page.evaluate(async s => {
      try {
        const d = await window.QuickDetail.draw(s);
        return { ok: true, name: d && d.name, items: d && d.items.length };
      } catch (e) { return { ok: false, err: String((e && e.message) || e) }; }
    }, text);
    await page.waitForTimeout(600);
    await page.evaluate(() => { if (typeof fitAll === 'function') fitAll(); });
    await page.waitForTimeout(800);
    const png = path.join(outDir, path.basename(file, '.json') + '.png');
    await page.screenshot({ path: png });
    if (!r.ok) failed = true;
    console.log(r.ok ? 'drawn ' : 'FAIL  ', path.relative(ROOT, file), r.ok ? `${r.items} items, "${r.name}"` : r.err, '->', png);
  }
  if (errors.length) { failed = true; console.log('page errors:', JSON.stringify(errors)); }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
