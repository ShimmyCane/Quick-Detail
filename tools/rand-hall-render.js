// Renders the Rand Hall iterations from the exported viewer (docs/rand-hall/rand-hall-history.html):
// one PNG per iteration, framed on what that iteration added, one PNG of the whole sheet, and a screenshot of the viewer.
//   node tools/rand-hall-render.js
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'rand-hall', 'review');

(async function () {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', function (e) { errors.push(String(e)); });
  await page.goto('file://' + path.join(ROOT, 'docs', 'rand-hall', 'rand-hall-history.html'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'viewer.png'), fullPage: true });

  const shots = await page.evaluate(function () {
    const SK = window.SK;
    const b = JSON.parse(document.getElementById('bundle').textContent);
    const ac = { factor: SK.scaleOf(b.details[0].scale).factor, caps: true, roundTo: 1 / 16, measure: SK.measure };
    const ink = SK.inkFor('ink', '#fbfaf7');
    function png(items, focus, w, h) {
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const v = SK.fitView(SK.itemsBounds(focus, ac), w, h, 30);
      SK.paint(cv.getContext('2d'), items, v, { ac: ac, ink: ink, paper: '#fbfaf7', bg: '#fbfaf7', w: w, h: h });
      return cv.toDataURL('image/png');
    }
    const out = [];
    b.sessions.forEach(function (s) {
      SK.segment(s).forEach(function (m) {
        const state = SK.stateAt(s, m.end);
        const n = Number((m.ids[0] || '').split('-')[0].slice(1));
        const mine = state.filter(function (it) { return it.id.indexOf('i' + n + '-') === 0; });
        out.push({ name: 'iter-' + String(n).padStart(2, '0'), url: png(state, mine, 2400, 1600) });
      });
    });
    const all = b.details.reduce(function (acc, d) { return acc.concat(d.items.filter(function (it) { return !acc.some(function (x) { return x.id === it.id; }); })); }, []);
    out.push({ name: 'sheet-all', url: png(all, all, 3200, 2000) });
    return out;
  });
  shots.forEach(function (s) {
    fs.writeFileSync(path.join(OUT, s.name + '.png'), Buffer.from(s.url.split(',')[1], 'base64'));
    console.log('wrote ' + s.name + '.png');
  });
  if (errors.length) console.log('page errors:\n' + errors.join('\n'));
  await browser.close();
})();
