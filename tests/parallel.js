// Node tests for the JSON parallel of a detail. Run from the project folder:  node tests/parallel.js
'use strict';
var fs = require('fs');
var path = require('path');
require('../sketch/core.js');
require('../sketch/units.js');
require('../sketch/hatch.js');
require('../sketch/annot.js');
require('../sketch/author.js');
require('../sketch/parallel.js');
var SK = globalThis.SK;
var failures = 0;
function check(name, ok, info) {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (info ? '  ' + info : ''));
  if (!ok) failures++;
}

var example = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'examples', 'window-sill-concrete-12in.json'), 'utf8'));
var d = SK.authorDetail(example);
d.id = 'd1';
d.parentId = null;

var take = {
  id: 'r1', created: 1000, duration: 5000, scale: d.scale, base: [],
  speech: [{ t: 100, text: 'concrete wall twelve inch' }],
  voice: [[0, 4000]],
  events: [
    { t: 0, type: 'put', item: d.items[0], anim: false },
    { t: 500, type: 'put', item: d.items[5], anim: false },
    { t: 900, type: 'del', id: d.items[5].id },
    { t: 1200, type: 'mark' }
  ]
};
var live = { detailId: 'd1', scale: d.scale, base: [], events: [{ t: 0, type: 'mark' }], speech: [], voice: [] };

var p = SK.parallelOf(d, [take, Object.assign({ id: 'live', recording: true }, live)], 0);

check('parallel has its schema and the detail id', p.schema === 'quick-detail/parallel-1' && p.detailId === 'd1');
check('the drawing items are kept exactly', p.items.length === d.items.length && p.items[0] === d.items[0]);
check('spec leaves out angular dims only', p.spec.items.length === d.items.length, p.spec.items.length + ' of ' + d.items.length);
var rect = p.spec.items.filter(function (s) { return s.kind === 'line'; })[0];
check('a stroke becomes a line with its weight', rect.weight === 'w3', JSON.stringify(rect.weight));
check('stroke corners are listed once', rect.pts.length === 5, 'pts=' + rect.pts.length);
check('a note keeps its text and arrow', p.spec.items.some(function (s) { return s.kind === 'note' && s.text === '12" concrete wall' && s.tip && s.arrow === 'filled'; }));

check('one entry per take, the live take last', p.takes.length === 2 && p.takes[1].recording === true);
check('a take keeps its commands', p.takes[0].commands.length === 4 && p.takes[0].commands[0].type === 'put');
check('a take keeps its speech', p.takes[0].speech[0].text === 'concrete wall twelve inch');
check('a take has scenes with their text', p.takes[0].scenes.length >= 1 && p.takes[0].scenes[0].text.indexOf('concrete') >= 0, JSON.stringify(p.takes[0].scenes.map(function (s) { return s.text; })));

var again = SK.authorDetail(JSON.parse(JSON.stringify(p)));
check('the parallel can generate a new detail', again.items.length === p.spec.items.length && again.name === d.name, again.items.length + ' items');
check('a spec from a parallel round-trips its kinds', again.items.map(function (i) { return i.kind; }).join() === p.spec.items.map(function (s) { return s.kind === 'line' ? 'stroke' : s.kind; }).join());

console.log(failures ? failures + ' failed' : 'all passed');
process.exit(failures ? 1 : 0);
