// Browser smoke test: loads index.html in headless Chromium and drives the page.
// Draws, undoes and redoes, uses each tool, opens every panel and page, and fails on any page error.
// Run from the project folder:  node tests/browser-smoke.js [path/to/index.html]
// Needs Playwright. When it is not installed, the test says so and exits without failing.
'use strict';
var path = require('path');
var playwright;
try { playwright = require('playwright'); } catch (e) {
  console.log('skip: Playwright is not installed, so the browser smoke test did not run.');
  process.exit(0);
}

var page_ = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
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
  page.on('console', function (m) { if (m.type() === 'error' && !/supabase|ERR_|net::|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  await page.route(/^https?:\/\//, function (r) { r.abort(); });   // no network: the cloud library is simply unavailable
  await page.goto('file://' + page_);
  await page.waitForFunction(function () { return window.__started && window.__sketch && window.__sketch.state().detail; }, null, { timeout: 10000 });
  check('app starts', true);

  async function state() {
    return page.evaluate(function () {
      var s = window.__sketch.state();
      return { items: s.detail.items.length, kinds: s.detail.items.map(function (i) { return i.kind; }).join(','), sel: s.sel && s.sel.id, z: s.view.z, scale: s.detail.scale };
    });
  }
  async function stroke(x0, y0, x1, y1) {
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    for (var i = 1; i <= 10; i++) await page.mouse.move(x0 + (x1 - x0) * i / 10, y0 + (y1 - y0) * i / 10);
    await page.mouse.up();
  }
  async function tap(x, y) { await page.mouse.click(x, y); await page.waitForTimeout(30); }

  var s0 = await state();
  await stroke(400, 300, 600, 320);
  await stroke(400, 400, 600, 420);
  var s1 = await state();
  check('pen draws two strokes', s1.items === s0.items + 2, s1.kinds);

  await page.keyboard.press('Control+z');
  check('undo removes one', (await state()).items === s0.items + 1);
  await page.keyboard.press('Control+Shift+z');
  check('redo puts it back', (await state()).items === s0.items + 2);

  // Text: arrow point, text start, type, Done.
  await page.keyboard.press('t');
  await tap(500, 310);
  await tap(700, 250);
  await page.keyboard.type('SILL PAN');
  await page.keyboard.press('Control+Enter');
  var s2 = await state();
  check('text tool adds a note', /note/.test(s2.kinds), s2.kinds);

  // Dimension: two points, then drag out the line.
  await page.keyboard.press('d');
  await tap(400, 500);
  await tap(600, 500);
  await stroke(500, 500, 500, 560);
  var s3 = await state();
  check('dimension tool adds a dim', /dim/.test(s3.kinds), s3.kinds);
  check('the new dim is selected and its chips show', !!s3.sel && await page.isVisible('#chips'));
  await page.keyboard.press('Escape');

  // Hatch: drag a rectangle.
  await page.keyboard.press('h');
  await stroke(300, 600, 450, 700);
  check('hatch tool adds a hatch', /hatch/.test((await state()).kinds));
  await page.keyboard.press('Escape');

  // Select, duplicate, delete.
  await page.keyboard.press('v');
  await tap(500, 410);
  var s4 = await state();
  check('select picks a stroke', !!s4.sel);
  var n4 = s4.items;
  await page.click('#chips >> text=Duplicate');
  check('duplicate adds a copy', (await state()).items === n4 + 1);
  await page.keyboard.press('Delete');
  check('delete removes it', (await state()).items === n4);
  await page.keyboard.press('Escape');
  await page.keyboard.press('v');

  // Erase over the first stroke.
  await page.keyboard.press('e');
  var n5 = (await state()).items;
  await stroke(500, 290, 500, 330);
  check('erase removes what it crosses', (await state()).items < n5);
  await page.keyboard.press('Escape');

  // Zoom keys and fit.
  var z0 = (await state()).z;
  await page.keyboard.press('=');
  check('zoom in', (await state()).z > z0);
  await page.keyboard.press('f');

  // Panels on the right rail.
  for (var act of ['project', 'settings']) {
    await page.click('#rail [data-act="' + act + '"]');
    check('panel ' + act + ' opens', await page.isVisible('#panel') && (await page.textContent('#panelBody')).length > 20);
    await page.click('#panelClose');
  }
  await page.click('#rail [data-act="log"]');
  check('log opens', await page.isVisible('#log'));
  await page.click('#logClose');

  // Scale change from Info, then undo it in one step.
  await page.click('#rail [data-act="project"]');
  var before = (await state()).scale;
  await page.selectOption('#panelBody select[aria-label="Scale"]', { index: 2 });
  var after = (await state()).scale;
  check('scale changes from Info', after !== before, before + ' -> ' + after);
  await page.click('#panelClose');
  await page.keyboard.press('Control+z');
  check('one undo brings the scale back', (await state()).scale === before);

  // Library, card popup, edit tags, bin.
  await page.click('#rail [data-act="library"]');
  check('library opens', await page.isVisible('#libPage'));
  await page.waitForSelector('#libBody .lib-card');
  await page.click('#libBody .lib-card b');
  check('card popup opens', await page.isVisible('.info-card'));
  await page.click('.info-card .pop-x');
  await page.click('#libMoreBtn');
  await page.click('#tagsOpen');
  check('edit tags page opens', await page.isVisible('#tagsPage'));
  await page.click('#tagsClose');
  await page.click('#libBin');
  await page.waitForTimeout(100);
  check('recycle bin shows', /bin/i.test(await page.textContent('#libBody')));
  await page.click('#libClose');

  // Recording is saved once stopped; the log then lists a scene.
  await page.evaluate(function () { return window.__sketch.stopRecording(); });
  await page.waitForTimeout(200);
  check('scene count shows', +(await page.textContent('#sceneCount')) >= 1);

  check('no page errors', errors.length === 0, errors.join(' | '));
  var final = await state();
  console.log('final: ' + JSON.stringify({ items: final.items, kinds: final.kinds }));
  await browser.close();
  console.log(failures ? failures + ' failed' : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
