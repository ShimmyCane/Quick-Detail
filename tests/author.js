// Node tests for drawing from JSON. Run from the project folder:  node tests/author.js
'use strict';
var fs = require('fs');
var path = require('path');
require('../sketch/core.js');
require('../sketch/units.js');
require('../sketch/hatch.js');
require('../sketch/annot.js');
require('../sketch/author.js');
var SK = globalThis.SK;
var failures = 0;
function check(name, ok, info) {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (info ? '  ' + info : ''));
  if (!ok) failures++;
}
function throws(fn, text) {
  try { fn(); return false; } catch (e) { return String(e.message).indexOf(text) >= 0; }
}

var example = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'examples', 'window-sill-concrete-12in.json'), 'utf8'));
var d = SK.authorDetail(example);

check('example builds a named detail', d.name === 'Interior window sill, 12in concrete wall', d.name);
check('example keeps its scale and tags', d.scale === '3"=1\'-0"' && d.tags.join() === 'window,wall');
check('one item per spec entry', d.items.length === example.items.length, d.items.length + ' items');

var ids = d.items.map(function (it) { return it.id; });
check('ids are unique', ids.filter(function (v, i) { return ids.indexOf(v) === i; }).length === ids.length);

// Text sizes from the spec: text_scale as a number, and by class.
var P = SK.PAPER.text;
var sized = SK.authorDetail({ name: 'Sizes', scale: '1/4"=1\'-0"', items: [
  { kind: 'note', text: 'plain', at: [0, 0], width: 40, tip: [1, 1] },
  { kind: 'note', text: 'Title', at: [0, 0], width: 40, tip: [1, 1], text_class: 'title' },
  { kind: 'note', text: 'Small', at: [0, 0], width: 40, tip: [1, 1], text_class: 'small' },
  { kind: 'dim', mode: 'ortho', p1: [0, 0], p2: [10, 0], at: [5, -2] }
], text_scale: { title: 6, note: 4, small: 3.5, dim: 3.5 } });
check('no text_scale keeps paper text', Math.abs(d.items.filter(function (it) { return it.kind === 'note'; })[0].size - P) < 1e-9);
check('note class sets its size', Math.abs(sized.items[0].size - P * 4) < 1e-9, sized.items[0].size);
check('title class sets its size', Math.abs(sized.items[1].size - P * 6) < 1e-9, sized.items[1].size);
check('small class sets its size', Math.abs(sized.items[2].size - P * 3.5) < 1e-9, sized.items[2].size);
check('dim takes the dim size', Math.abs(sized.items[3].size - P * 3.5) < 1e-9, sized.items[3].size);
var numeric = SK.authorDetail({ name: 'N', scale: '1/4"=1\'-0"', text_scale: 2, items: [
  { kind: 'note', text: 'two', at: [0, 0], width: 20, tip: [1, 1] } ] });
check('a number sets every note', Math.abs(numeric.items[0].size - P * 2) < 1e-9);
check('unknown text_class is refused', throws(function () { SK.authorDetail({ name: 'X', items: [
  { kind: 'note', text: 'x', at: [0, 0], width: 20, tip: [1, 1], text_class: 'huge' } ], text_scale: { note: 4 } }); }, 'unknown text_class'));
check('non-positive text_scale is refused', throws(function () { SK.authorDetail({ name: 'X', items: [
  { kind: 'note', text: 'x', at: [0, 0], width: 20, tip: [1, 1] } ], text_scale: -1 }); }, 'positive'));

var stroke = d.items.filter(function (it) { return it.kind === 'stroke'; });
check('lines and rects become strokes', stroke.length === 3, stroke.length + ' strokes');
check('a rect stroke lists its interior corners twice and has a world weight', stroke[0].pts.length === 8 && stroke[0].w === SK.WEIGHTS.w3 * 4, 'pts=' + stroke[0].pts.length + ' w=' + stroke[0].w);
check('a rect closes on its first point', JSON.stringify(stroke[0].pts[0].slice(0, 2)) === JSON.stringify(stroke[0].pts[7].slice(0, 2)));

var hatches = d.items.filter(function (it) { return it.kind === 'hatch'; });
check('hatch keeps its pattern and outline', hatches[0].pattern === 'concrete' && hatches[0].outline === true);

var notes = d.items.filter(function (it) { return it.kind === 'note'; });
check('notes get a leader and a size', notes.length === 4 && notes[0].leaders.length === 1 && notes[0].size === SK.PAPER.text);
check('note arrow defaults to filled', notes[0].leaders[0].arrow === 'filled');

var dims = d.items.filter(function (it) { return it.kind === 'dim'; });
check('ortho dims read orientation from the offset', dims[0].orient === 'h' && dims[1].orient === 'v', dims[0].orient + ' ' + dims[1].orient);
check('a dim measures to 12 inches', SK.dimMeasure(dims[0]) === 12, String(SK.dimMeasure(dims[0])));
check('the wall dim reads 1\'-0"', SK.dimText(dims[0], { roundTo: 1 / 16 }) === '1\'-0"', SK.dimText(dims[0], { roundTo: 1 / 16 }));

check('default scale is 3"=1\'-0"', SK.authorDetail({ items: [{ kind: 'line', pts: [[0, 0], [1, 0]] }] }).scale === SK.DEFAULT_SCALE);
check('scale factor changes the stroke weight', SK.authorDetail({ scale: '1"=1\'-0"', items: [{ kind: 'line', pts: [[0, 0], [1, 0]], weight: 'w2' }] }).items[0].w === SK.WEIGHTS.w2 * 12);

check('refuses no items', throws(function () { SK.authorDetail({ items: [] }); }, 'non-empty'));
check('refuses an unknown kind', throws(function () { SK.authorDetail({ items: [{ kind: 'circle' }] }); }, 'unknown kind "circle"'));
check('refuses an unknown pen', throws(function () { SK.authorDetail({ items: [{ kind: 'line', pts: [[0, 0], [1, 0]], pen: 'chartreuse' }] }); }, 'unknown pen'));
check('refuses an unknown hatch', throws(function () { SK.authorDetail({ items: [{ kind: 'hatch', pattern: 'marble', pts: [[0, 0], [1, 0], [1, 1]] }] }); }, 'unknown hatch pattern'));
check('refuses a note with no tip', throws(function () { SK.authorDetail({ items: [{ kind: 'note', text: 'x', at: [0, 0], width: 4 }] }); }, 'needs a tip'));
check('refuses a rect with no size', throws(function () { SK.authorDetail({ items: [{ kind: 'rect', x: 0, y: 0, w: 0, h: 2 }] }); }, 'positive w and h'));
check('names the item that is wrong', throws(function () { SK.authorDetail({ items: [{ kind: 'line', pts: [[0, 0], [1, 0]] }, { kind: 'line', pts: [[0]] }] }); }, 'Item 2'));

console.log(failures ? failures + ' failed' : 'all passed');
process.exit(failures ? 1 : 0);
