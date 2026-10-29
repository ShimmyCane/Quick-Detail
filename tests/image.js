// Node tests for images on the sheet. Run from the project folder:  node tests/image.js
'use strict';
require('../sketch/core.js');
require('../sketch/units.js');
require('../sketch/hatch.js');
require('../sketch/annot.js');
require('../sketch/analyze.js');
var SK = globalThis.SK;
var failures = 0;
function check(name, ok, info) {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (info ? '  ' + info : ''));
  if (!ok) failures++;
}

var img = { id: 'i1', kind: 'image', src: 'data:image/jpeg;base64,', at: [2, 3], w: 10, h: 5, noPrint: true, name: 'site photo' };
var line = { id: 's1', kind: 'stroke', t0: 0, w: 0.08, c: 'ink', pts: [[0, 0, 0.5, 0], [4, 0, 0.5, 0]] };
var ac = { factor: 4, caps: true, roundTo: 1 / 16, measure: function (t, s) { return String(t).length * s * 0.6; } };

var b = SK.itemBounds(img, ac);
check('image bounds are its box', b.minx === 2 && b.miny === 3 && b.maxx === 12 && b.maxy === 8, JSON.stringify(b));
check('a point inside the image hits it', SK.hitItem(img, [7, 5], 0.1, ac));
check('a point outside the image misses it', !SK.hitItem(img, [20, 5], 0.1, ac));
check('printable leaves out a no-print image', SK.printable([line, img]).length === 1);
check('printable keeps an accepted image', SK.printable([line, Object.assign({}, img, { noPrint: false })]).length === 2);
check('print bounds ignore the no-print image', SK.itemsBounds(SK.printable([line, img]), ac).maxx === 4);
var d = SK.describeItem(img, ac);
check('an image is described for metadata', d.type === 'image' && d.label === 'image: site photo (no print)', d.label);

console.log(failures ? failures + ' failed' : 'all passed');
process.exit(failures ? 1 : 0);
