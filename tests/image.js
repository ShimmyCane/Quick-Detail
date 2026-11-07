// Node tests for images on the sheet. Run from the project folder:  node tests/image.js
'use strict';
require('../sketch/core.js');
require('../sketch/units.js');
require('../sketch/hatch.js');
require('../sketch/annot.js');
require('../sketch/blocks.js');
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


// Turning: the box turns about its centre, and bounds, hits and the transform follow it.
var turned = { id: 'i2', kind: 'image', src: 'data:image/jpeg;base64,', at: [2, 3], w: 10, h: 5, rot: Math.PI / 2, name: 'turned' };
var tb = SK.itemBounds(turned, ac);
check('a quarter turn swaps the bounds about the centre', Math.abs(tb.minx - 4.5) < 1e-9 && Math.abs(tb.maxx - 9.5) < 1e-9 && Math.abs(tb.miny - 0.5) < 1e-9 && Math.abs(tb.maxy - 10.5) < 1e-9, JSON.stringify(tb));
check('a point inside the turned picture hits it', SK.hitItem(turned, [5, 5.5], 0.01, ac));
check('a point outside the turned picture misses it', !SK.hitItem(turned, [1, 5.5], 0.01, ac));
var rt = SK.worldToImage(turned, SK.imageToWorld(turned, 3, 1));
check('world and picture coordinates round-trip', Math.abs(rt[0] - 3) < 1e-9 && Math.abs(rt[1] - 1) < 1e-9, JSON.stringify(rt));
var moved = SK.transformItem(turned, function (p) { return [p[0] + 1, p[1] + 2]; }, 1, 0);
check('moving a turned picture moves its centre and keeps the turn', moved.rot === turned.rot && Math.abs(moved.at[0] - 3) < 1e-9 && Math.abs(moved.at[1] - 5) < 1e-9, JSON.stringify(moved.at));
var spun = SK.transformItem(img, function (p) { return p; }, 1, Math.PI / 2);
check('turning an unturned picture sets its turn', Math.abs(spun.rot - Math.PI / 2) < 1e-9);

// Calibration reads a typed length into real inches.
check('2 feet 0 inches reads as 24 inches', SK.parseLength("2'-0\"") === 24, String(SK.parseLength("2'-0\"")));
check('2 feet 6 inches reads as 30 inches', SK.parseLength("2' 6\"") === 30);
check('2 feet reads as 24 inches', SK.parseLength('2 ft') === 24);
check('2.5 feet reads as 30 inches', SK.parseLength('2.5 ft') === 30);
check('24 inches reads as 24', SK.parseLength('24"') === 24 && SK.parseLength('24 in') === 24 && SK.parseLength('24') === 24);
check('6 and a half inches reads as 6.5', SK.parseLength('6 1/2"') === 6.5);
check('a fraction alone reads as its value', SK.parseLength('1/2"') === 0.5);
check('nonsense reads as null', SK.parseLength('two feet') === null && SK.parseLength('') === null && SK.parseLength(null) === null);
console.log(failures ? failures + ' failed' : 'all passed');
process.exit(failures ? 1 : 0);
