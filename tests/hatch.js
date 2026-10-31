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

var big = [[0, 0], [6, 0], [6, 6], [0, 6]];
function prims(key, poly) { return SK.hatchPrims({ kind: 'hatch', pattern: key, pts: poly || big, outline: false }, factor); }
function inside(p, poly) { return SK.pointInPoly(p, poly || big); }

check('the section set includes brick, batt, rigid, block and gravel', ['brick', 'batt', 'rigid', 'cmu', 'gravel'].every(function (k) { return !!SK.hatchOf(k); }));

var brick = prims('brick');
check('brick is a diagonal fill', brick.length > 5 && brick.every(function (p) {
  var dx = p.pts[1][0] - p.pts[0][0], dy = p.pts[1][1] - p.pts[0][1];
  return Math.abs(Math.abs(dx) - Math.abs(dy)) < 1e-9;
}));

var cmu = prims('cmu');
var cmuH = cmu.filter(function (p) { return Math.abs(p.pts[0][1] - p.pts[1][1]) < 1e-9; }).length;
var cmuV = cmu.filter(function (p) { return Math.abs(p.pts[0][0] - p.pts[1][0]) < 1e-9; });
check('concrete block has courses and joints', cmuH > 0 && cmuV.length > 0, cmuH + ' courses, ' + cmuV.length + ' joints');
var jointsByRow = {};
cmuV.forEach(function (p) { var r = Math.round(p.pts[0][1] / (SK.hatchOf('cmu').blocks.h * factor)); (jointsByRow[r] = jointsByRow[r] || []).push(p.pts[0][0]); });
var r0 = jointsByRow[1] || [], r1 = jointsByRow[2] || [];
check('running bond: joints on alternate courses are offset', r0.length > 0 && r1.length > 0 && Math.abs(r0[0] - r1[0]) > 1e-6 || (r0.length && r1.length && r0.indexOf(r1[0]) < 0), JSON.stringify([r0.slice(0, 2), r1.slice(0, 2)]));
check('block joints stop at the course lines', cmuV.every(function (p) {
  var h = SK.hatchOf('cmu').blocks.h * factor;
  var rowOf = Math.floor((p.pts[0][1] + 1e-9) / h);
  return p.pts[0][1] >= rowOf * h - 1e-9 && p.pts[1][1] <= (rowOf + 1) * h + 1e-9;
}));

var batt = prims('batt');
check('batt insulation is a wavy line inside the region', batt.length > 20 && batt.every(function (p) {
  return inside([(p.pts[0][0] + p.pts[1][0]) / 2, (p.pts[0][1] + p.pts[1][1]) / 2]);
}), batt.length + ' pieces');
check('batt is wavy, not straight', batt.some(function (p) { return Math.abs(p.pts[0][1] - p.pts[1][1]) > 1e-3 && Math.abs(p.pts[0][0] - p.pts[1][0]) > 1e-3; }));

var rigid = prims('rigid');
check('rigid board is a crosshatch at 45 degrees both ways', rigid.some(function (p) { return p.pts[1][1] > p.pts[0][1] && p.pts[1][0] > p.pts[0][0]; }) && rigid.some(function (p) { return p.pts[1][1] < p.pts[0][1] && p.pts[1][0] > p.pts[0][0]; }));

var gravel = prims('gravel');
check('gravel is sparser, larger dots than stipple', gravel.length > 0 && gravel.length < prims('concrete').length && gravel[0].r > prims('concrete')[0].r);

var classicBrick = prims('brick-classic');
check('classic brick is running bond: joints in alternate courses', classicBrick.length > 10 && classicBrick.some(function (p) { return Math.abs(p.pts[0][0] - p.pts[1][0]) < 1e-9; }));
var big = [[0, 0], [40, 0], [40, 40], [0, 40]];
var classicStone = SK.hatchPrims({ kind: 'hatch', pattern: 'stone-classic', pts: big, outline: false }, factor);
check('classic stone draws closed sharp-cornered stones inside the region', classicStone.length > 20 && classicStone.every(function (p) {
  var last = p.pts.length - 1;
  return p.pts.length >= 4 && Math.abs(p.pts[0][0] - p.pts[last][0]) < 1e-9 && Math.abs(p.pts[0][1] - p.pts[last][1]) < 1e-9 && p.pts.every(function (q) { return q[0] > 0 && q[0] < 40 && q[1] > 0 && q[1] < 40; });
}), classicStone.length + ' stones');
var classicConc = SK.hatchPrims({ kind: 'hatch', pattern: 'concrete-classic', pts: big, outline: false }, factor);
check('classic concrete has dots and triangles', classicConc.some(function (p) { return p.k === 'dot'; }) && classicConc.some(function (p) { return p.k === 'path' && p.pts.length === 4; }));
var classicSteel = prims('steel-classic');
check('classic steel is paired lines at -45 degrees (up to the right)', classicSteel.length > 0 && classicSteel.every(function (p) { return p.pts[1][1] < p.pts[0][1] && p.pts[1][0] > p.pts[0][0]; }));
check('classic steel pairs are close: two families offset', classicSteel.some(function (p) { return p.pts[0][1] !== 0; }));

console.log(failures ? failures + ' failed' : 'all passed');
process.exit(failures ? 1 : 0);
