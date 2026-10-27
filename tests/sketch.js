// Node tests for the sketch logic (no browser needed). Run from the project folder:  node tests/sketch.js
'use strict';
require('../sketch/core.js');
require('../sketch/units.js');
require('../sketch/annot.js');
var SK = globalThis.SK;
var failures = 0;
function check(name, ok, info) {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (info ? '  ' + info : ''));
  if (!ok) failures++;
}
function near(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-6); }

// A stroke that starts at t0 and lasts `len` ms, with points every 100 ms.
function stroke(id, t0, len) {
  var pts = [];
  for (var dt = 0; dt <= len; dt += 100) pts.push([dt / 100, 0, 0.5, dt]);
  return { id: id, kind: 'stroke', t0: t0, w: 0.1, pts: pts };
}
function draw(s) { return { t: s.t0, type: 'put', item: s, anim: true }; }

// ---------------- replay ----------------
var old = { id: 'old', kind: 'stroke', t0: 0, w: 0.1, pts: [[5, 5, 0.5, 0]] };
var s1 = stroke('a', 1000, 500);
var note = { id: 'n1', kind: 'note', text: 'X' };
var session = {
  base: [old],
  events: [
    draw(s1),
    { t: 1600, type: 'del', id: 'a' },
    { t: 2000, type: 'put', item: note },
    { t: 2500, type: 'put', item: { id: 'n1', kind: 'note', text: 'Y' } },
    { t: 5000, type: 'replace', items: [] }
  ]
};
check('before recording: base only', SK.stateAt(session, 0).length === 1);
check('mid-stroke: stroke is cut short', (function () {
  var st = SK.stateAt(session, 1250);
  return st.length === 2 && st[1].id === 'a' && st[1].pts.length === 3 && s1.pts.length === 6;
})());
check('del removes the stroke', !SK.stateAt(session, 1700).some(function (s) { return s.id === 'a'; }));
check('put adds a note', SK.stateAt(session, 2100).some(function (s) { return s.id === 'n1' && s.text === 'X'; }));
check('put with the same id replaces', SK.stateAt(session, 2600).filter(function (s) { return s.id === 'n1'; })[0].text === 'Y');
check('replace swaps the sheet', SK.stateAt(session, 5100).length === 0);
check('stateAt leaves base alone', session.base.length === 1);
check('restored old stroke (not live) is not cut', (function () {
  var restored = { id: 'r', kind: 'stroke', t0: 90000, w: 0.1, pts: [[0, 0, 0.5, 0], [1, 1, 0.5, 300]] };
  var s = { base: [], events: [{ t: 100, type: 'put', item: restored }] };
  return SK.stateAt(s, 200).length === 1 && SK.stateAt(s, 200)[0].pts.length === 2;
})());

// ---------------- scenes ----------------
function gap(ms) { return { base: [], speech: [], events: [draw(stroke('a', 0, 500)), draw(stroke('b', 500 + ms, 500))] }; }
check('gap of 2 s stays one scene', SK.segment(gap(2000)).length === 1);
check('gap of 3 s starts a new scene', SK.segment(gap(3000)).length === 2);

var talk = {
  base: [],
  events: [draw(stroke('a', 0, 500))],
  speech: [{ t: 800, text: 'Membrane laps shed water.' }, { t: 1200, text: 'Then the flashing.' }]
};
var m = SK.segment(talk);
check('speech joins the scene of the stroke', m.length === 1 && m[0].text === 'Membrane laps shed water. Then the flashing.' && m[0].ids.join() === 'a');

var marked = {
  base: [],
  events: [draw(stroke('a', 0, 500)), { t: 700, type: 'mark' }],
  speech: [{ t: 1500, text: 'Now the sill.' }]
};
var mm = SK.segment(marked);
check('a mark starts a new scene even mid-activity', mm.length === 2 && mm[1].marked && mm[1].text === 'Now the sill.', JSON.stringify(mm));

var voiced = { base: [], events: [draw(stroke('a', 0, 500))], voice: [[2000, 6000]], speech: [] };
check('voice activity keeps the scene going', SK.segment(voiced).length === 1 && SK.segment(voiced)[0].end === 6000);

check('edits count as activity', SK.segment({ base: [], events: [draw(stroke('a', 0, 500)), { t: 900, type: 'del', id: 'a' }] })[0].end === 900);
check('no activity gives no scenes', SK.segment({ base: [], events: [] }).length === 0);
check('firstWords', SK.firstWords('one two three four five', 3) === 'one two three…' && SK.firstWords('a b', 8) === 'a b');
check('formatTime', SK.formatTime(65400) === '01:05' && SK.formatTime(-5) === '00:00');

// ---------------- units ----------------
check('formatLength 22"', SK.formatLength(22) === '1\'-10"', SK.formatLength(22));
check('formatLength 10.5"', SK.formatLength(10.5) === '10 1/2"');
check('formatLength 1/16', SK.formatLength(0.0625) === '1/16"');
check('formatLength rounds to 1/4', SK.formatLength(3.3, 1 / 4) === '3 1/4"', SK.formatLength(3.3, 1 / 4));
check('formatLength 12"', SK.formatLength(12) === '1\'-0"');
check('formatAngle', SK.formatAngle(45.1) === '45°' && SK.formatAngle(22.4) === '22.5°');
check('scale lookup', SK.scaleOf('1"=1\'-0"').factor === 12 && SK.scaleOf('nonsense').factor === 4);

// ---------------- annotations ----------------
var ac = { factor: 4, caps: true, roundTo: 1 / 16, measure: function (t, size) { return t.length * size * 0.6; } };

check('ortho orient: dragged above -> horizontal', SK.orthoOrient([0, 0], [10, 2], [5, -6]) === 'h');
check('ortho orient: dragged right -> vertical', SK.orthoOrient([0, 0], [2, 10], [8, 5]) === 'v');

var hd = { id: 'd1', kind: 'dim', mode: 'ortho', orient: 'h', p1: [0, 0], p2: [22, 5], at: [11, -4] };
check('ortho measure ignores the off-axis part', near(SK.dimMeasure(hd), 22) && SK.dimText(hd, ac) === '1\'-10"');
check('override with <> keeps the measured value', SK.dimText(Object.assign({}, hd, { text: '<> CLR.' }), ac) === '1\'-10" CLR.');
var al = { id: 'd2', kind: 'dim', mode: 'aligned', p1: [0, 0], p2: [3, 4], at: [0, 10] };
check('aligned measures true length', near(SK.dimMeasure(al), 5) && SK.dimText(al, ac) === '5"');
var lay = SK.dimLayout(hd, ac);
check('dimension line sits at the dragged height', near(lay.A[1], -4) && near(lay.B[1], -4) && near(lay.A[0], 0) && near(lay.B[0], 22));
check('dimension text is upright and above the line', lay.prims.some(function (p) { return p.k === 'text' && near(p.rot, 0) && p.at[1] < -4; }));
var vd = { id: 'd3', kind: 'dim', mode: 'ortho', orient: 'v', p1: [0, 0], p2: [0, 10], at: [6, 5] };
check('vertical dimension text reads from the right', SK.dimLayout(vd, ac).prims.some(function (p) { return p.k === 'text' && near(Math.abs(p.rot), Math.PI / 2); }));
var ang = { id: 'd4', kind: 'dim', mode: 'angular', vertex: [0, 0], p1: [10, 0], p2: [0, 10], at: [5, 5] };
check('angular measures the inside angle', near(SK.dimMeasure(ang), 90) && SK.dimText(ang, ac) === '90°');
check('angular outside angle when dragged outside', near(SK.dimMeasure(Object.assign({}, ang, { at: [-5, -5] })), 270));

var nt = { id: 'n1', kind: 'note', text: 'self-adhered membrane lapped 4 in', at: [10, 0], width: 6, height: null, leaders: [{ id: 'l1', tip: [0, 5], bends: [], arrow: 'filled' }] };
var nl = SK.noteLayout(nt, ac);
var texts = nl.prims.filter(function (p) { return p.k === 'text'; });
check('note text wraps to its width', texts.length > 1 && texts.every(function (p) { return ac.measure(p.text, p.size) <= 6 + 1e-9 || p.text.indexOf(' ') < 0; }), texts.length + ' lines');
check('note text in capitals', texts[0].text === texts[0].text.toUpperCase());
check('leader from the left: text left-justified, leader ends at the left side', nl.align === 'left' && nl.leaderPaths[0][nl.leaderPaths[0].length - 1][0] < 10);
check('leader has a horizontal landing', near(nl.leaderPaths[0][1][1], nl.leaderPaths[0][2][1]));
check('filled arrowhead at the tip', nl.prims.some(function (p) { return p.k === 'path' && p.fill && p.pts[0][0] === 0 && p.pts[0][1] === 5; }));
var nr = SK.noteLayout(Object.assign({}, nt, { leaders: [{ id: 'l1', tip: [30, 5], bends: [], arrow: 'dot' }] }), ac);
check('leader from the right: text right-justified', nr.align === 'right' && nr.prims.some(function (p) { return p.k === 'dot'; }));
var fixed = SK.noteLayout(Object.assign({}, nt, { height: nl.lineH }), ac);
check('manual height clips with an ellipsis', fixed.prims.filter(function (p) { return p.k === 'text'; }).length === 1 && /…$/.test(fixed.prims[0].text));
check('hit a note inside its box', SK.hitItem(nt, [12, 1], 0.1, ac) && !SK.hitItem(nt, [40, 40], 0.1, ac));
check('hit a dimension on its line', SK.hitItem(hd, [11, -4], 0.1, ac));
check('bounds include the leader tip', SK.itemBounds(nt, ac).minx <= 0);

var st = { id: 's', kind: 'stroke', t0: 0, w: 0.1, pts: [[0, 0, 0.5, 0], [10, 0, 0.5, 0]] };
check('snap to a stroke end first', SK.snap([st], [10.2, 0.1], 0.5).kind === 'point');
check('snap onto a stroke', (function () { var s = SK.snap([st], [5, 0.3], 0.5); return s.kind === 'line' && near(s.p[1], 0); })());
check('no snap when far', SK.snap([st], [5, 5], 0.5).kind === null);

// ---------------- colour, weight and grid ----------------
check('default gray background: black ink', SK.inkFor('ink', '#bdbdbd') === '#111111');
check('black ink turns white on black', SK.inkFor('ink', '#000000') === '#f4f4f2');
check('black ink turns white on slate', SK.inkFor('ink', '#2b3a4a') === '#f4f4f2');
check('black ink stays black on white and cream', SK.inkFor('ink', '#ffffff') === '#111111' && SK.inkFor('ink', '#f3ead7') === '#111111');
check('a named pen keeps its colour on any background', SK.inkFor('red', '#000000') === SK.PENS.red && SK.inkFor('blue', '#ffffff') === SK.PENS.blue);
check('an unknown colour falls back to black', SK.inkFor('purple', '#ffffff') === '#111111');
check('luma runs from black to white', near(SK.luma('#000000'), 0) && near(SK.luma('#ffffff'), 1, 1e-9));
check('four line weights, heaviest last', Object.keys(SK.WEIGHTS).length === 4 && SK.WEIGHTS.w4 > SK.WEIGHTS.w3 && SK.WEIGHTS.w3 > SK.WEIGHTS.w2 && SK.WEIGHTS.w2 > SK.WEIGHTS.w1);
check('grid is a quarter inch on paper, so it scales with the factor', near(SK.gridStep(4), 1) && near(SK.gridStep(48), 12));

console.log(failures ? failures + ' failed' : 'all passed');
process.exit(failures ? 1 : 0);
