// Node tests for blocks (no browser needed). Run from the project folder:  node tests/blocks.js
'use strict';
require('../sketch/core.js');
require('../sketch/units.js');
require('../sketch/annot.js');
require('../sketch/blocks.js');
var SK = globalThis.SK;
var failures = 0;
function check(name, ok, info) {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (info ? '  ' + info : ''));
  if (!ok) failures++;
}
function near(a, b) { return Math.abs(a - b) < 1e-9; }

var ac = { factor: 4, measure: function () { return 1; } };
function line(id, x0, y0, x1, y1) { return { id: id, kind: 'stroke', w: 0.1, pts: [[x0, y0, 0.5, 0], [x1, y1, 0.5, 100]] }; }
function block(id, sourceId, dx, dy) { return { id: id, kind: 'block', sourceId: sourceId, at: [dx, dy] }; }
function detail(id, items) { return { id: id, name: id, items: items }; }

// A small library: window is a wall with one line; wall nests inside wall-set; wall-set nests inside house.
var lib = {
  window: detail('window', [line('w1', 0, 0, 1, 0)]),
  wall: detail('wall', [line('l1', 0, 0, 0, 2), block('b1', 'window', 2, 1)]),
  house: detail('house', [block('h1', 'wall', 10, 0)])
};
function sourceOf(id) { return lib[id] || null; }

// ---------------- flattening ----------------
var flat = SK.flattenItems([block('x', 'window', 5, 3)], sourceOf);
check('a block draws its source moved by its offset', flat.length === 1 && near(flat[0].pts[0][0], 5) && near(flat[0].pts[0][1], 3) && near(flat[0].pts[1][0], 6));
check('the source is not changed by flattening', lib.window.items[0].pts[0][0] === 0 && lib.window.items[0].pts[0][1] === 0);

var nested = SK.flattenItems([block('x', 'wall', 10, 0)], sourceOf);
// wall's own line (0,0)-(0,2) moves to (10,0)-(10,2); window inside wall at (2,1) moves to (12,1)-(13,1).
check('offsets add up through nested blocks', nested.length === 2 && near(nested[1].pts[0][0], 12) && near(nested[1].pts[0][1], 1));

var notes = SK.flattenItems([block('n', 'note-src', 1, 1)], function () {
  return { id: 'note-src', items: [{ id: 'nt', kind: 'note', text: 'A', at: [2, 3], width: 4, leaders: [{ id: 'l', tip: [1, 1], bends: [[1, 2]], arrow: 'filled' }] }] };
});
check('notes move their box, tips and bends', near(notes[0].at[0], 3) && near(notes[0].leaders[0].tip[0], 2) && near(notes[0].leaders[0].bends[0][1], 3));

var dim = SK.flattenItems([block('d', 'dim-src', 1, 0)], function () {
  return { id: 'dim-src', items: [{ id: 'dm', kind: 'dim', mode: 'aligned', p1: [0, 0], p2: [2, 0], at: [1, 1], end: 'tick', text: null }] };
});
check('dimension points move', near(dim[0].p1[0], 1) && near(dim[0].p2[0], 3) && near(dim[0].at[0], 2) && dim[0].p1 !== undefined);

// ---------------- missing and depth guards ----------------
var missing = SK.flattenItems([block('m', 'gone', 0, 0)], sourceOf);
check('a missing source draws nothing', missing.length === 0);
check('missing blocks are listed for the placeholder', SK.missingBlocks([block('m', 'gone', 0, 0), block('ok', 'window', 0, 0)], sourceOf).length === 1);

var loopLib = { a: detail('a', [block('ba', 'b', 0, 0)]), b: detail('b', [block('bb', 'a', 0, 0)]) };
var loopOf = function (id) { return loopLib[id] || null; };
check('a loop in stored data stops instead of recursing', SK.flattenItems([block('s', 'a', 0, 0)], loopOf).length === 0);

// ---------------- refusals ----------------
check('a detail cannot hold itself', /itself/.test(SK.blockRefusal('wall', lib.wall.items, 'wall', sourceOf)));
check('a block that would loop is refused', /loop/.test(SK.blockRefusal('window', lib.window.items, 'house', sourceOf)));
check('a block of a detail not on the device is refused', /not on this device/.test(SK.blockRefusal('house', lib.house.items, 'nowhere', sourceOf)));
check('an allowed block is accepted', SK.blockRefusal('house', lib.house.items, 'window', sourceOf) === null);

var deep = {};
for (var i = 0; i < 6; i++) deep['d' + i] = detail('d' + i, i === 0 ? [line('z', 0, 0, 1, 1)] : [block('c' + i, 'd' + (i - 1), 0, 0)]);
var deepOf = function (id) { return deep[id] || null; };
check('nesting deeper than the limit is refused', /levels deep/.test(SK.blockRefusal('top', [], 'd5', deepOf)));
check('nesting at the limit is accepted', SK.blockRefusal('top', [], 'd4', deepOf) === null);

// ---------------- who uses a source ----------------
var all = [lib.window, lib.wall, lib.house, detail('other', [line('o', 0, 0, 1, 1)])];
var users = SK.usersOf('window', all).map(function (d) { return d.id; }).sort();
check('users include details that hold the source through another block', users.join(',') === 'house,wall', users.join(','));
check('a detail with no blocks is used by nobody', SK.usersOf('other', all).length === 0);

// ---------------- copy in and bounds ----------------
var n = 0;
var copies = SK.copyInBlock(block('x', 'wall', 0, 0), sourceOf, function () { return 'new' + (++n); });
var ids = copies.map(function (c) { return c.id; });
check('copies get new, distinct ids', ids.length === 2 && ids[0] !== ids[1] && ids.every(function (s) { return /^new/.test(s); }));
check('copies do not share points with the source', copies[0].pts !== lib.wall.items[0].pts && lib.wall.items[0].pts[0][0] === 0);

var b = SK.blockBounds(block('x', 'window', 5, 3), sourceOf, ac);
check('block bounds follow its drawing', b && near(b.minx, 5) && near(b.maxx, 6) && near(b.miny, 3));
var pb = SK.blockBounds(block('m', 'gone', 5, 3), sourceOf, ac);
check('a missing block has a placeholder box', pb && near(pb.minx, 5) && pb.maxx > pb.minx);
check('a block is hit on its line', SK.blockHit(block('x', 'window', 5, 3), [5.5, 3], 0.1, sourceOf, ac));
check('a block is not hit away from its line', !SK.blockHit(block('x', 'window', 5, 3), [5.5, 9], 0.1, sourceOf, ac));

// ---------------- scale ----------------
var scaled = SK.flattenItems([{ id: 'sb', kind: 'block', sourceId: 'window', at: [10, 0], k: 2 }], sourceOf);
check('a scaled block scales its points about its origin', near(scaled[0].pts[0][0], 10) && near(scaled[0].pts[1][0], 12));
check('a scaled block scales its line weight', near(scaled[0].w, 0.2));
var nestedK = SK.flattenItems([{ kind: 'block', sourceId: 'nest-outer', at: [0, 0], k: 1 }], function (id) {
  return { 'nest-outer': { id: 'nest-outer', items: [{ kind: 'block', sourceId: 'window', at: [1, 0], k: 2 }] } }[id] || lib[id] || null;
});
check('nested scales multiply', near(nestedK[0].pts[0][0], 1) && near(nestedK[0].pts[1][0], 3));
check('a block without k draws at scale 1', SK.blockScale({ kind: 'block' }) === 1);

// ---------------- turning ----------------
var turned = SK.flattenItems([{ kind: 'block', sourceId: 'window', at: [0, 0], k: 1, rot: Math.PI / 2 }], sourceOf);
check('a turned block turns its points about its origin', near(turned[0].pts[0][0], 0) && near(turned[0].pts[0][1], 0) && near(turned[0].pts[1][0], 0) && near(turned[0].pts[1][1], 1), JSON.stringify(turned[0].pts));
var turnedMoved = SK.flattenItems([{ kind: 'block', sourceId: 'window', at: [5, 0], k: 1, rot: Math.PI / 2 }], sourceOf);
check('a turned block keeps its origin where it was placed', near(turnedMoved[0].pts[0][0], 5) && near(turnedMoved[0].pts[0][1], 0));
var stroke = { id: 's', kind: 'stroke', w: 0.1, pts: [[1, 0, 0.5, 0], [0, 1, 0.5, 1]] };
var rotated = SK.transformItem(stroke, function (p) { return [-p[1], p[0]]; }, 1, 0);
check('transformItem applies the point map to strokes', near(rotated.pts[0][0], 0) && near(rotated.pts[0][1], 1) && near(rotated.pts[1][0], -1) && near(rotated.pts[1][1], 0));
check('transformItem scales stroke widths', near(SK.transformItem(stroke, function (p) { return p; }, 2, 0).w, 0.2));
var turnedBlock = SK.transformItem({ id: 'b', kind: 'block', sourceId: 'window', at: [1, 0], k: 1 }, function (p) { return [-p[1], p[0]]; }, 1, Math.PI / 2);
check('transformItem turns a block and adds the angle', near(turnedBlock.rot, Math.PI / 2) && near(turnedBlock.at[0], 0) && near(turnedBlock.at[1], 1));

// ---------------- underlay printing ----------------
var printed = SK.printable([{ kind: 'block', sourceId: 'window', at: [0, 0] }, { kind: 'block', sourceId: 'window', at: [0, 0], print: true }, { kind: 'stroke', pts: [] }]);
check('a block is left out of prints unless it is set to print', printed.length === 2 && printed[0].print === true && printed[1].kind === 'stroke');

console.log(failures ? failures + ' FAILED' : 'all block checks passed');
process.exitCode = failures ? 1 : 0;
