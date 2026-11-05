// Checks that a drawing's notes read as text blocks: several rows of 4 to 10 words each, not long lines of a few rows.
// It wraps each note the way the page does (SK.noteLayout with the page's own text measure), counts the words on every
// line, and suggests a width that lands near 7 words a line.
//
//   node tools/note-blocks.js docs/examples/rand-hall/*.json            report every note
//   node tools/note-blocks.js --strict docs/examples/foo.json           exit 1 if any note is out of range
//
// Rules (from review, 5 Nov 2026):
//   - a note of fewer than 4 words is a label: one line is right, and it is not checked
//   - a note of 4 to 10 words may sit on one line
//   - a longer note is a block: every line but the last has 4 to 10 words, and the last is not a single orphan word
//   - aim for about 7 words a line; a wide, short note (1 or 2 long lines) fails even if it fits on the sheet
// Text sizes: a spec may give "text_scale" as a number, or as { title, note, small, dim } with "text_class" on each
// note, as tools/rand-hall.js writes. Sizes are applied here the same way before wrapping.
// Needs Playwright (preinstalled in the cloud container).
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const MIN = 4, MAX = 10, AIM = 7;

(async function () {
  const args = process.argv.slice(2);
  const strict = args.indexOf('--strict') >= 0;
  const files = args.filter(function (a) { return a !== '--strict'; });
  if (!files.length) { console.log('usage: node tools/note-blocks.js [--strict] spec.json ...'); process.exit(2); }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + path.join(ROOT, 'viewer.html'));
  await page.addScriptTag({ path: path.join(ROOT, 'sketch', 'author.js') });

  let failed = 0, checked = 0;
  for (const f of files) {
    const spec = JSON.parse(fs.readFileSync(f, 'utf8'));
    const rows = await page.evaluate(function (a) {
      const SK = window.SK, spec = a.spec;
      const made = SK.authorDetail(spec);
      const ac = { factor: SK.scaleOf(made.scale).factor, caps: true, roundTo: 1 / 16, measure: SK.measure };
      const ts = spec.text_scale;
      function sizeOf(src) {
        if (typeof ts === 'number') return SK.PAPER.text * ts;
        if (ts && typeof ts === 'object') return SK.PAPER.text * (ts[src.text_class || 'note'] || 1);
        return SK.PAPER.text;
      }
      function linesOf(note) {
        return SK.noteLayout(note, ac).prims.filter(function (p) { return p.k === 'text'; }).map(function (p) { return p.text; });
      }
      function counts(lines) { return lines.map(function (l) { return l.split(/\s+/).filter(Boolean).length; }); }
      function ok(c) {
        if (c.length === 1) return c[0] <= a.MAX;
        for (let i = 0; i < c.length - 1; i++) if (c[i] < a.MIN || c[i] > a.MAX) return false;
        return c[c.length - 1] >= 2 || c.length === 1;
      }
      const out = [];
      made.items.forEach(function (it, i) {
        if (it.kind !== 'note') return;
        it.size = sizeOf(spec.items[i]);
        const words = String(it.text).split(/\s+/).filter(Boolean).length;
        if (words < a.MIN) return;
        const c = counts(linesOf(it));
        const good = ok(c);
        let suggest = null;
        if (!good) {
          // Try widths from narrow to wide and keep the one whose lines sit closest to the aim.
          let best = null;
          for (let k = 0.15; k <= 2.5; k += 0.05) {
            const w = it.width * k;
            const cc = counts(linesOf(Object.assign({}, it, { width: w })));
            if (!ok(cc)) continue;
            const body = cc.length > 1 ? cc.slice(0, -1) : cc;
            const avg = body.reduce(function (s, n) { return s + n; }, 0) / body.length;
            const score = Math.abs(avg - a.AIM);
            if (!best || score < best.score) best = { score: score, width: Math.round(w), counts: cc };
          }
          suggest = best;
        }
        out.push({ n: i + 1, text: it.text, width: it.width, counts: c, good: good, suggest: suggest });
      });
      return out;
    }, { spec: spec, MIN: MIN, MAX: MAX, AIM: AIM });

    const bad = rows.filter(function (r) { return !r.good; });
    checked += rows.length;
    failed += bad.length;
    console.log(path.relative(ROOT, f) + ': ' + rows.length + ' notes, ' + bad.length + ' out of range');
    bad.forEach(function (r) {
      const s = r.suggest ? ' -> width ' + r.suggest.width + ' gives [' + r.suggest.counts.join(', ') + ']' : ' -> no width fits; shorten or split the text';
      console.log('  item ' + r.n + ' width ' + Math.round(r.width) + ' words/line [' + r.counts.join(', ') + ']' + s);
      console.log('    "' + (r.text.length > 70 ? r.text.slice(0, 67) + '...' : r.text) + '"');
    });
  }
  console.log('checked ' + checked + ' notes, ' + failed + ' out of range (' + MIN + '-' + MAX + ' words a line)');
  await browser.close();
  if (strict && failed) process.exit(1);
})();
