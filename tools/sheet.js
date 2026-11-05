// Quick Detail — sheet tools for the AI: look closer, and find text that collides.
// Both run the app's own code in headless Chromium (viewer.html loads sketch/*.js), so what they measure and draw is
// what the app shows. Real inches throughout.
//
//   node tools/sheet.js crop <src> --rect x0,y0,x1,y1 --out file.png [--width 1600] [--lane 0]
//       A zoomed picture of one rectangle of the sheet. Use it to check fine detail that a whole-sheet render hides.
//   node tools/sheet.js overlaps <src> [--lane 0] [--pad 0.5] [--json]
//       Lists every note whose text box runs into another note's box, or over linework (strokes and hatch corners).
//       Leaders are not checked: an arrow crossing a wall is normal. Exit code 1 if anything is found.
//   node tools/sheet.js map <src> [--lane 0] --out file.png
//       The whole sheet with every note box outlined and numbered, so a crop can be found by number.
//
// <src> is either:
//   - a detail spec (docs/examples/*.json): built with SK.authorDetail, so it is what the app would draw
//   - a history bundle (docs/rand-hall/history.json, or an exported *-history.html): --lane picks a root lane by its order
//     (0 = first root lane). Branches are not drawn; crop them by giving their own bundle lane index with --lane.
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const VIEWER = path.join(ROOT, 'viewer.html');

function argv() {
  const a = process.argv.slice(2);
  const cmd = a.shift();
  const opts = { _: [] };
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith('--')) {
      const k = a[i].slice(2);
      const v = (a[i + 1] && !a[i + 1].startsWith('--')) ? a[++i] : true;
      opts[k] = v;
    } else opts._.push(a[i]);
  }
  return { cmd: cmd, opts: opts };
}

async function openPage() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', function (e) { errors.push(String(e)); });
  // Only local files load: the viewer's cloud library script is not needed to draw, and a blocked host must not stall it.
  await page.route('**/*', function (r) { return r.request().url().startsWith('file://') ? r.continue() : r.abort(); });
  await page.goto('file://' + VIEWER);
  await page.waitForFunction(function () { return window.SK && SK.noteLayout; }, null, { timeout: 20000 });
  // The viewer does not load the spec builder, so it is added here.
  await page.addScriptTag({ path: path.join(ROOT, 'sketch', 'author.js') });
  await page.waitForFunction(function () { return !!SK.authorDetail; }, null, { timeout: 5000 });
  // The helpers below run in the page, so they are installed there from their source.
  await page.evaluate(function (src) {
    window.LOAD = (0, eval)('(' + src.load + ')');
    window.COLLIDE = (0, eval)('(' + src.collide + ')');
  }, { load: LOAD.toString(), collide: COLLIDE.toString() });
  return { browser: browser, page: page, errors: errors };
}

// Runs in the page: returns { name, scale, items } for the source.
const LOAD = function (src, laneIndex) {
  const SK = window.SK;
  if (src.schema === 'quick-detail/history-1') {
    const roots = src.details.filter(function (d) { return !d.parentId; });
    const lane = roots[laneIndex] || roots[0];
    return { name: lane.name, scale: lane.scale, items: lane.items || [] };
  }
  const made = SK.authorDetail(src);
  return { name: made.name, scale: made.scale, items: made.items };
};

// ----------------------------------------------------------------------------------------------------------------
function cropCmd(opts, page, src) {
  const r = String(opts.rect || '').split(',').map(Number);
  if (r.length !== 4 || r.some(function (n) { return !isFinite(n); }) || !(r[2] > r[0]) || !(r[3] > r[1])) {
    throw new Error('--rect needs x0,y0,x1,y1 in real inches, with x1 > x0 and y1 > y0');
  }
  const width = Number(opts.width || 1600);
  const out = String(opts.out || '');
  if (!out) throw new Error('--out file.png is required');
  return page.evaluate(function (a) {
    const SK = window.SK;
    const d = LOAD(a.src, a.lane);
    const ac = { factor: SK.scaleOf(d.scale).factor, caps: true, roundTo: 1 / 16, measure: SK.measure };
    const ink = SK.inkFor('ink', '#fbfaf7');
    const x0 = a.r[0], y0 = a.r[1], x1 = a.r[2], y1 = a.r[3];
    const z = a.width / (x1 - x0);
    const w = Math.round(a.width), h = Math.round((y1 - y0) * z);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const v = { x: x0, y: y0, z: z };
    SK.paint(cv.getContext('2d'), d.items, v, { ac: ac, ink: ink, paper: '#fbfaf7', bg: '#fbfaf7', w: w, h: h });
    return { name: d.name, png: cv.toDataURL('image/png'), w: w, h: h };
  }, { src: src.json, lane: src.lane, r: r, width: width }).then(function (res) {
    fs.writeFileSync(out, Buffer.from(res.png.split(',')[1], 'base64'));
    console.log('wrote ' + out + ' (' + res.w + ' x ' + res.h + ' px) of "' + res.name + '" rect ' + r.join(', ') + ' in');
  });
}

// ----------------------------------------------------------------------------------------------------------------
// The text box of every note, from the app's own layout, and the linework points that fall inside it.
const COLLIDE = function (src, laneIndex, pad) {
  const SK = window.SK;
  const d = LOAD(src, laneIndex);
  const ac = { factor: SK.scaleOf(d.scale).factor, caps: true, roundTo: 1 / 16, measure: SK.measure };
  // Each note's ink: one rectangle per printed line, as wide as the text really is (not the note's box width).
  const notes = [];
  d.items.forEach(function (it, i) {
    if (it.kind !== 'note') return;
    const lay = SK.noteLayout(it, ac);
    const rects = lay.prims.filter(function (p) { return p.k === 'text'; }).map(function (p) {
      const w = ac.measure(p.text, p.size);
      const x0 = p.align === 'right' ? p.at[0] - w : p.at[0];
      return { x: x0, y: p.at[1] - p.size * 0.8, w: w, h: p.size * 1.0 };
    });
    notes.push({ id: it.id, text: String(it.text), rects: rects, box: lay.box });
  });
  function hit(a, b) { return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad; }
  function inRect(p, r) { return p[0] >= r.x - pad && p[0] <= r.x + r.w + pad && p[1] >= r.y - pad && p[1] <= r.y + r.h + pad; }
  const pairs = [];
  for (let i = 0; i < notes.length; i++) for (let j = i + 1; j < notes.length; j++) {
    const a = notes[i], b = notes[j];
    if (a.rects.some(function (ra) { return b.rects.some(function (rb) { return hit(ra, rb); }); })) pairs.push([a.id, b.id]);
  }
  const over = [];
  notes.forEach(function (n) {
    let strokes = 0; const hatches = [];
    d.items.forEach(function (it) {
      if (it.kind === 'stroke') {
        if (it.pts.some(function (p) { return n.rects.some(function (r) { return inRect(p, r); }); })) strokes++;
      } else if (it.kind === 'hatch') {
        if (it.pts.some(function (p) { return n.rects.some(function (r) { return inRect(p, r); }); })) hatches.push(it.id);
      }
    });
    if (strokes || hatches.length) over.push({ id: n.id, text: n.text, strokes: strokes, hatches: hatches });
  });
  return { name: d.name, notes: notes.length, pairs: pairs, over: over,
    boxes: notes.map(function (n) { return { id: n.id, text: n.text, rects: n.rects }; }) };
};

function overlapsCmd(opts, page, src) {
  const pad = Number(opts.pad == null ? 0.5 : opts.pad);
  return page.evaluate(function (a) { return COLLIDE(a.src, a.lane, a.pad); }, { src: src.json, lane: src.lane, pad: pad }).then(function (res) {
    if (opts.json) { console.log(JSON.stringify(res, null, 1)); }
    else {
      console.log('"' + res.name + '": ' + res.notes + ' notes, ' + res.pairs.length + ' note-on-note, ' + res.over.length + ' note-on-linework (pad ' + pad + ' in)');
      res.pairs.forEach(function (p) { console.log('  text collides: ' + p[0] + ' with ' + p[1]); });
      res.over.forEach(function (o) {
        const parts = [];
        if (o.strokes) parts.push(o.strokes + ' stroke point' + (o.strokes > 1 ? 's' : ''));
        if (o.hatches.length) parts.push('hatch ' + o.hatches.join(', '));
        console.log('  over linework: ' + o.id + ' (' + parts.join('; ') + ') "' + (o.text.length > 50 ? o.text.slice(0, 47) + '...' : o.text) + '"');
      });
    }
    return res.pairs.length + res.over.length;
  });
}

// ----------------------------------------------------------------------------------------------------------------
function mapCmd(opts, page, src) {
  const out = String(opts.out || '');
  if (!out) throw new Error('--out file.png is required');
  return page.evaluate(function (a) {
    const SK = window.SK;
    const d = LOAD(a.src, a.lane);
    const ac = { factor: SK.scaleOf(d.scale).factor, caps: true, roundTo: 1 / 16, measure: SK.measure };
    const ink = SK.inkFor('ink', '#fbfaf7');
    const w = 3200, h = 2000;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    const v = SK.fitView(SK.itemsBounds(d.items, ac), w, h, 60);
    SK.paint(g, d.items, v, { ac: ac, ink: ink, paper: '#fbfaf7', bg: '#fbfaf7', w: w, h: h });
    // Number each note box so a crop can be asked for by number.
    let n = 0;
    d.items.forEach(function (it) {
      if (it.kind !== 'note') return;
      n++;
      const b = SK.noteLayout(it, ac).box;
      const p0 = SK.toScreen(v, [b.x, b.y]), p1 = SK.toScreen(v, [b.x + b.w, b.y + b.h]);
      g.strokeStyle = '#d6336c'; g.lineWidth = 2;
      g.strokeRect(p0[0], p0[1], p1[0] - p0[0], p1[1] - p0[1]);
      g.fillStyle = '#d6336c'; g.font = '22px sans-serif';
      g.fillText(String(n), p0[0] + 2, p0[1] - 4);
    });
    return { png: cv.toDataURL('image/png'), notes: n, name: d.name };
  }, { src: src.json, lane: src.lane }).then(function (res) {
    fs.writeFileSync(out, Buffer.from(res.png.split(',')[1], 'base64'));
    console.log('wrote ' + out + ' — "' + res.name + '", ' + res.notes + ' note boxes numbered in reading order of the file');
  });
}

// ----------------------------------------------------------------------------------------------------------------
(async function () {
  const { cmd, opts } = argv();
  const srcPath = opts._[0];
  if (!cmd || !['crop', 'overlaps', 'map'].includes(cmd) || !srcPath) {
    console.log('usage: node tools/sheet.js crop|overlaps|map <spec.json|history.json> [--lane n] [options]');
    process.exit(2);
  }
  const json = JSON.parse(fs.readFileSync(path.resolve(srcPath), 'utf8'));
  const lane = Number(opts.lane || 0);
  const br = await openPage();
  let code = 0;
  try {
    const src = { json: json, lane: lane };
    if (cmd === 'crop') await cropCmd(opts, br.page, src);
    if (cmd === 'overlaps') code = (await overlapsCmd(opts, br.page, src)) ? 1 : 0;
    if (cmd === 'map') await mapCmd(opts, br.page, src);
    if (br.errors.length) console.log('page errors:\n' + br.errors.join('\n'));
  } finally {
    await br.browser.close();
  }
  process.exit(code);
})().catch(function (e) { console.error(e.message || e); process.exit(2); });
