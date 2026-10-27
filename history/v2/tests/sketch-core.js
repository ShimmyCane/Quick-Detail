// Node test for the sketch logic (no browser needed). Run from the project folder:  node tests/sketch-core.js
'use strict';
var SK = require('../sketch/core.js');
var failures = 0;
function check(name, ok, info) {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (info ? '  ' + info : ''));
  if (!ok) failures++;
}

// Helpers: a stroke that starts at t0 and lasts `len` ms, with points every 100 ms.
function stroke(id, t0, len) {
  var pts = [];
  for (var dt = 0; dt <= len; dt += 100) pts.push([0.1, 0.2, 0.5, dt]);
  return { id: id, t0: t0, pts: pts };
}
function add(s) { return { t: s.t0, type: 'add', stroke: s }; }

// --- replay ---
var base = [{ id: 'old', t0: 0, pts: [[0.5, 0.5, 0.5, 0]] }];
var s1 = stroke('a', 1000, 500);
var s2 = stroke('b', 3000, 400);
var session = {
  base: base,
  events: [add(s1), { t: 1600, type: 'undo', id: 'a' }, add(s2), { t: 5000, type: 'clear' }],
  speech: []
};

check('before recording: base only', SK.stateAt(session, 0).length === 1);
check('mid-stroke: stroke is cut short', (function () {
  var st = SK.stateAt(session, 1250);
  var last = st[st.length - 1];
  return st.length === 2 && last.id === 'a' && last.pts.length === 3;
})());
check('stroke finished, not yet undone', SK.stateAt(session, 1500).some(function (s) { return s.id === 'a'; }));
check('undo removes the stroke', !SK.stateAt(session, 1700).some(function (s) { return s.id === 'a'; }));
check('stroke b drawn after undo', SK.stateAt(session, 3200).map(function (s) { return s.id; }).join() === 'old,b');
check('clear empties the sheet', SK.stateAt(session, 5100).length === 0);
check('stateAt does not change base', session.base.length === 1 && session.base[0].id === 'old');

// --- moments ---
var gap = function (ms) {
  return {
    base: [], speech: [],
    events: [add(stroke('a', 0, 500)), add(stroke('b', 500 + ms, 500))]
  };
};
check('gap of 2 s stays one moment', SK.segment(gap(2000)).length === 1);
check('gap of 3 s starts a new moment', SK.segment(gap(3000)).length === 2);

var mixed = {
  base: [],
  events: [add(stroke('a', 0, 500)), { t: 700, type: 'undo', id: 'a' }],
  speech: [{ t: 800, text: 'Membrane laps shed water.' }, { t: 1200, text: 'Then the flashing.' }]
};
var m = SK.segment(mixed);
check('speech joins the moment of the stroke', m.length === 1 && m[0].text === 'Membrane laps shed water. Then the flashing.', JSON.stringify(m));
check('moment holds the stroke ids', m[0].strokeIds.join() === 'a');

var late = {
  base: [],
  events: [add(stroke('a', 0, 500))],
  speech: [{ t: 9000, text: 'Later thought.' }]
};
var lm = SK.segment(late);
check('speech after a long quiet gap is its own moment', lm.length === 2 && lm[1].text === 'Later thought.' && lm[1].strokeIds.length === 0);

var undone = {
  base: [],
  events: [add(stroke('a', 0, 500)), { t: 900, type: 'undo', id: 'a' }],
  speech: []
};
check('an undo right after a stroke belongs to its moment', SK.segment(undone).length === 1 && SK.segment(undone)[0].end === 900);

var empty = { base: [], events: [], speech: [] };
check('no activity gives no moments', SK.segment(empty).length === 0);

check('formatTime', SK.formatTime(65400) === '01:05' && SK.formatTime(-5) === '00:00');

console.log(failures ? failures + ' failed' : 'all passed');
process.exit(failures ? 1 : 0);
