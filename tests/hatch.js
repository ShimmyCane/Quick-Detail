// Node tests for hatch patterns. Run from the project folder:  node tests/hatch.js
'use strict';
require('../sketch/core.js');
require('../sketch/units.js');
require('../sketch/hatch.js');
var SK = globalThis.SK;
var failures = 0;
function check(name, ok, info) {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (info ? '  ' + info : ''));
  if (!ok) failures++;
}
var square = [[0, 0], [4, 0], [4, 4], [0, 4]];
var factor = 4;
var m = SK.HATCH_MARGIN_PAPER * factor;

check('all named patterns exist', ['wood1', 'wood2', 'concrete', 'plywood', 'gypsum', 'insulation', 'cmu', 'earth', 'screen', 'steel'].every(function (k) { return !!SK.hatchOf(k); }));
check('unknown pattern gives no fill', SK.hatchPrims({ kind: 'hatch', pattern: 'nope', pts: square, outline: false }, factor).length === 0);

var wood = SK.hatchPrims({ kind: 'hatch', pattern: 'wood1', pts: square, outline: false }, factor);
check('wood1 draws lines inside the region', wood.length >= 5 && wood.every(function (p) { return p.k === 'path' && p.pts.length === 2; }), wood.length + ' lines');
check('lines stop the error margin short of the edge', wood.every(function (p) {
  return p.pts.every(function (q) { return q[0] >= m - 1e-9 && q[0] <= 4 - m + 1e-9 && q[1] >= 0 && q[1] <= 4; });
}));
check('no line lies on the boundary', wood.every(function (p) { return p.pts[0][1] > 1e-6 && p.pts[0][1] < 4 - 1e-6; }));

var spacing = SK.hatchOf('wood1').fams[0].s * factor;
check('spacing follows the scale factor', Math.abs(wood[1].pts[0][1] - wood[0].pts[0][1] - spacing) < 1e-9, spacing.toFixed(3));

var insul = SK.hatchPrims({ kind: 'hatch', pattern: 'insulation', pts: square, outline: false }, factor);
var horiz = insul.filter(function (p) { return Math.abs(p.pts[0][1] - p.pts[1][1]) < 1e-9; }).length;
var vert = insul.filter(function (p) { return Math.abs(p.pts[0][0] - p.pts[1][0]) < 1e-9; }).length;
check('insulation is a grid: lines both ways', horiz > 0 && vert > 0, horiz + ' across, ' + vert + ' up');

var dots = SK.hatchPrims({ kind: 'hatch', pattern: 'concrete', pts: square, outline: false }, factor);
check('concrete stipples dots inside the region', dots.length > 10 && dots.every(function (p) {
  return p.k === 'dot' && p.c[0] > 0 && p.c[0] < 4 && p.c[1] > 0 && p.c[1] < 4;
}), dots.length + ' dots');
var again = SK.hatchPrims({ kind: 'hatch', pattern: 'concrete', pts: square, outline: false }, factor);
check('stipple is the same every time', JSON.stringify(dots) === JSON.stringify(again));

var steel = SK.hatchPrims({ kind: 'hatch', pattern: 'steel', pts: square, outline: false }, factor);
check('steel is one solid fill', steel.length === 1 && steel[0].fill === true && steel[0].closed === true);

var outlined = SK.hatchPrims({ kind: 'hatch', pattern: 'none', pts: square, outline: true }, factor);
check('outline draws the boundary', outlined.length === 1 && outlined[0].pts.length === 5);

check('a diagonal pattern runs at 45 degrees', SK.hatchPrims({ kind: 'hatch', pattern: 'wood2', pts: square, outline: false }, factor).every(function (p) {
  var dx = p.pts[1][0] - p.pts[0][0], dy = p.pts[1][1] - p.pts[0][1];
  return Math.abs(Math.abs(dx) - Math.abs(dy)) < 1e-9;
}));

check('point in polygon', SK.pointInPoly([2, 2], square) && !SK.pointInPoly([5, 2], square));

console.log(failures ? failures + ' failed' : 'all passed');
process.exit(failures ? 1 : 0);
