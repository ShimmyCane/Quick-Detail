// Box select and group move in headless Chromium: a pen-style drag on empty space picks the items inside the box,
// dragging inside the group moves them all in one undo step, and Esc clears the group.
// Run from the project folder:  node tests/box-select.js
// Needs Playwright. When it is not installed, the test says so and exits without failing.
'use strict';
var path = require('path');
var playwright;
try { playwright = require('playwright'); } catch (e) {
  console.log('skip: Playwright is not installed, so the box select test did not run.');
  process.exit(0);
}

var page_ = path.resolve(path.join(__dirname, '..', 'index.html'));
var failures = 0;
function check(name, ok, info) {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (info ? '  ' + info : ''));
  if (!ok) failures++;
}

(async function () {
  var browser = await playwright.chromium.launch();
  var page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  var errors = [];
  page.on('pageerror', function (e) { errors.push(e.message); });
  await page.route(/^https?:\/\//, function (r) { r.abort(); });
  await page.goto('file://' + page_);
  await page.waitForFunction(function () { return window.__started && window.__sketch && window.__sketch.state().detail; }, null, { timeout: 10000 });

  async function drag(points) {
    await page.mouse.move(points[0][0], points[0][1]);
    await page.mouse.down();
    for (var i = 1; i < points.length; i++) {
      var a = points[i - 1], b = points[i];
      for (var k = 1; k <= 8; k++) await page.mouse.move(a[0] + (b[0] - a[0]) * k / 8, a[1] + (b[1] - a[1]) * k / 8);
    }
    await page.mouse.up();
    await page.waitForTimeout(30);
  }
  async function stroke(x0, y0, x1, y1) { await drag([[x0, y0], [x1, y1]]); }
  function state() {
    return page.evaluate(function () {
      var s = window.__sketch.state();
      return { items: s.detail.items.map(function (i) { return { id: i.id, kind: i.kind, pts: i.pts ? i.pts.map(function (p) { return [p[0], p[1]]; }) : null }; }), group: window.group, tool: window.tool, sel: s.sel };
    });
  }

  // Three strokes, one above the other.
  await stroke(400, 300, 600, 320);
  await stroke(400, 400, 600, 420);
  await stroke(400, 500, 600, 520);
  var s0 = await state();
  check('three strokes drawn', s0.items.length === 3, 'items=' + s0.items.length);

  await page.keyboard.press('v');   // select mode
  check('select mode on', (await state()).tool === 'select');

  // A box round the top two strokes only: the third stays out.
  await drag([[350, 250], [650, 440]]);   // corner to corner
  var s1 = await state();
  check('box picks the two strokes wholly inside it', !!s1.group && s1.group.length === 2, 'group=' + JSON.stringify(s1.group));
  check('the stroke below the box is not picked', !!s1.group && s1.group.indexOf(s0.items[2].id) < 0);

  // Drag inside the group's box: both move together, and one undo step puts them back.
  var before = s1.items;
  await drag([[500, 350], [560, 350], [620, 350]]);
  var s2 = await state();
  var moved = s2.items.filter(function (it) { return s1.group.indexOf(it.id) >= 0; });
  var dx = moved.length ? moved[0].pts[0][0] - before.find(function (i) { return i.id === moved[0].id; }).pts[0][0] : 0;
  check('both grouped strokes moved by the same amount', moved.length === 2 && Math.abs(dx) > 0.5 &&
    moved.every(function (it) { var o = before.find(function (i) { return i.id === it.id; }); return Math.abs(it.pts[0][0] - o.pts[0][0] - dx) < 1e-3; }), 'dx=' + dx.toFixed(2));
  check('the third stroke did not move', JSON.stringify(s2.items[2]) === JSON.stringify(before[2]));
  check('the group is still selected after the move', !!s2.group && s2.group.length === 2);

  await page.keyboard.press('Control+z');
  var s3 = await state();
  check('one undo puts the whole group back', JSON.stringify(s3.items) === JSON.stringify(before));

  // Esc clears the group.
  await page.keyboard.press('Escape');
  check('Esc clears the group', (await state()).group === null);

  check('no page errors', errors.length === 0, errors.join(' | '));
  console.log(failures ? failures + ' failed' : 'all box select checks passed');
  await browser.close();
  process.exit(failures ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
