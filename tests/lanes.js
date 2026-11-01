// Node tests for lane steps and lane labels. Run from the project folder:  node tests/lanes.js
'use strict';
require('../sketch/core.js');
require('../sketch/lanes.js');
var SK = globalThis.SK;
var failures = 0;
function check(name, ok, info) {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (info ? '  ' + info : ''));
  if (!ok) failures++;
}

// A recording whose scenes are split by marks: each mark starts a new scene.
function marked(id, count) {
  var events = [];
  for (var i = 0; i < count; i++) events.push({ t: i * 1000, type: 'mark' });
  return { id: id, created: 1000, duration: count * 1000, events: events, speech: [], voice: [] };
}

// ---- steps ----
var steps = SK.laneSteps([marked('r1', 3), marked('r2', 2)]);
check('steps count across recordings', steps.length === 5, 'got ' + steps.length);
check('steps are numbered from 1 in order', steps.map(function (s) { return s.n; }).join() === '1,2,3,4,5');
check('each step names its recording', steps[2].sessionId === 'r1' && steps[3].sessionId === 'r2');
check('a lane with no recordings has no steps', SK.laneSteps([]).length === 0 && SK.laneSteps(undefined).length === 0);

// ---- labels ----
function lane(id, parentId, step, created) {
  return { id: id, parentId: parentId, fork: parentId ? { step: step } : null, created: created };
}

var one = SK.laneLabels([lane('main', null, null, 0)]);
check('main line is 0', one.main === '0', one.main);

var fourOnly = SK.laneLabels([lane('main', null, null, 0), lane('a', 'main', 4, 1)]);
check('first branch off step 4 is "0.4" (no letter)', fourOnly.a === '0.4', fourOnly.a);

var sameStep = SK.laneLabels([
  lane('main', null, null, 0), lane('a', 'main', 4, 1), lane('b', 'main', 4, 2), lane('c', 'main', 4, 3)
]);
check('later branches off the same step take B, C', sameStep.a === '0.4' && sameStep.b === '0.4B' && sameStep.c === '0.4C',
  [sameStep.a, sameStep.b, sameStep.c].join(' '));

var order = SK.laneLabels([
  lane('main', null, null, 0), lane('late', 'main', 4, 9), lane('early', 'main', 4, 2)
]);
check('letters follow creation order, not list order', order.early === '0.4' && order.late === '0.4B', order.early + ' ' + order.late);

var nested = SK.laneLabels([
  lane('main', null, null, 0), lane('a', 'main', 4, 1), lane('b', 'main', 4, 2), lane('sub', 'b', 6, 3),
  lane('sub2', 'b', 6, 4), lane('deep', 'sub', 2, 5), lane('step8', 'main', 8, 6)
]);
check('a branch off step 6 of 4B is 0.4B.6', nested.sub === '0.4B.6', nested.sub);
check('two branches off the same step inside 4B', nested.sub === '0.4B.6' && nested.sub2 === '0.4B.6B', nested.sub2);
check('a deeper branch joins the path: 0.4B.6.2', nested.deep === '0.4B.6.2', nested.deep);
check('a branch off step 8 of the main line is "0.8"', nested.step8 === '0.8', nested.step8);

var noFork = SK.laneLabels([lane('main', null, null, 0), { id: 'old', parentId: 'main', fork: null, created: 1 }]);
check('a branch without a recorded fork is "?", not guessed', noFork.old === '?', noFork.old);

var orphan = SK.laneLabels([lane('main', null, null, 0), lane('x', 'gone', 3, 1)]);
check('a lane whose parent is missing is treated as a root', orphan.x === '0', orphan.x);

// ---- versions ----
check('first version is v1', SK.versionLabel(1) === 'v1');
check('later versions count up: v2, v3', SK.versionLabel(2) === 'v2' && SK.versionLabel(3) === 'v3');
check('a missing version is v1', SK.versionLabel(undefined) === 'v1' && SK.versionLabel(0) === 'v1');

// ---- families and order ----
require('../sketch/history.js');
function d(id, parentId, step, created) { return { id: id, parentId: parentId || null, fork: parentId ? { step: step } : null, created: created || 0 }; }
var tree = [d('m'), d('a', 'm', 4, 1), d('b', 'm', 4, 2), d('sub', 'b', 6, 3), d('other', null, null, 9), d('late', 'm', 8, 4)];
check('family starts at the main line and holds every branch', SK.familyOf(tree, 'sub').map(function (x) { return x.id; }).sort().join() === 'a,b,late,m,sub' && SK.familyOf(tree, 'sub')[0].id === 'm');
check('a detail outside the family has no family', SK.familyOf(tree, 'nope').length === 0);
check('order: main, then each branch straight after its fork',
  SK.laneOrder(tree.filter(function (x) { return x.id !== 'other'; })).join() === 'm,a,b,sub,late', SK.laneOrder(tree).join());

// ---- time axis: a branch of a branch sits at the scene count along the whole line ----
var axis = SK.laneOffsets([d('m'), d('a', 'm', 4, 1), d('b', 'm', 4, 2), d('sub', 'b', 2, 3), d('deep', 'sub', 1, 4)]);
check('a branch sits at its fork step', axis.a === 4 && axis.b === 4, JSON.stringify(axis));
check('a branch of a branch adds its step to its parent\'s offset', axis.sub === 6, String(axis.sub));
check('the main line is at 0, and a branch of that is its fork step', axis.m === 0 && axis.deep === 7, String(axis.deep));

// ---- removing a scene ----
var rec = {
  id: 'r9', events: [
    { t: 0, type: 'mark' }, { t: 1000, type: 'put', item: { id: 'x', kind: 'stroke', t0: 1000, pts: [] }, anim: true },
    { t: 5000, type: 'mark' }, { t: 6000, type: 'del', id: 'x' }
  ],
  speech: [{ t: 1200, text: 'first words' }, { t: 5200, text: 'second' }],
  voice: [[1000, 1500], [5000, 5500]],
  notes: [{ key: SK.sceneKey('r9', 0), text: 'keep out' }, { key: SK.sceneKey('r9', 5000), text: 'stays' }]
};
var scenesOfRec = SK.segment(rec);
check('a recording of two marks has two scenes', scenesOfRec.length === 2, scenesOfRec.length);
var cut = SK.removeScene(rec, scenesOfRec[0]);
check('removing a scene takes its events, speech and voice', cut.events.length === 2 && cut.speech.length === 1 && cut.voice.length === 1);
check('removing a scene leaves the next scene where it was', SK.segment(cut).length === 1 && SK.segment(cut)[0].start === 5000);
check('removing a scene drops only its note', cut.notes.length === 1 && cut.notes[0].text === 'stays');
check('removing a scene does not change the recording it came from', rec.events.length === 4 && rec.notes.length === 2);

// ---- fork updates when a step goes ----
var forks = [d('m'), d('a', 'm', 4, 1), d('b', 'm', 4, 2), d('c', 'm', 8, 3), d('e', 'm', 2, 4)];
var upd = SK.stepDeleteUpdates(forks, 'm', 4);
var byUpd = {}; upd.forEach(function (u) { byUpd[u.id] = u.fork.step; });
check('a branch on the deleted step moves to the step before it', byUpd.a === 3 && byUpd.b === 3, JSON.stringify(byUpd));
check('a branch after the deleted step moves up one', byUpd.c === 7, JSON.stringify(byUpd));
check('a branch before the deleted step is left alone', byUpd.e === undefined);
check('steps renumber so labels follow', (function () {
  var moved = forks.map(function (x) { var u = upd.filter(function (q) { return q.id === x.id; })[0]; return u ? Object.assign({}, x, { fork: u.fork }) : x; });
  var labels = SK.laneLabels(moved);
  return labels.a === '0.3' && labels.b === '0.3B' && labels.c === '0.7' && labels.e === '0.2';
})());

// ---- promotion when a branch is deleted ----
var pr = [d('m'), d('a', 'm', 4, 1), d('sub', 'a', 6, 2), d('sub2', 'a', 6, 3)];
var pu = SK.promoteUpdates(pr, 'a');
check('deleting a branch promotes its branches to its fork point', pu.length === 2 && pu[0].parentId === 'm' && pu[0].fork.step === 4 && pu[1].fork.step === 4);
check('the main line cannot be promoted away', SK.promoteUpdates(pr, 'm').length === 0);

// ---- undo ----
var list = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }];
var entry = { details: [], sessions: SK.befores(list, ['a', 'c']) };
check('befores captures the current record, or null if there is none', entry.sessions[0].before.v === 1 && entry.sessions[1].before === null);
var after = SK.mergeRecords(list, [{ store: 'sessions', id: 'a', value: { id: 'a', v: 2 } }, { store: 'sessions', id: 'c', value: { id: 'c' } }]);
check('merging writes replaces and adds records', after.length === 3 && after[0].v === 2);
var back = SK.mergeRecords(after, SK.undoWrites({ sessions: [{ id: 'a', before: { id: 'a', v: 1 } }, { id: 'c', before: null }] }));
check('undo puts the old records back and removes added ones', back.length === 2 && back[0].v === 1 && back[1].id === 'b');
check('the history keeps entries in order and drops the oldest past its limit', (function () {
  var h = SK.History();
  for (var i = 0; i < SK.HISTORY_LIMIT + 5; i++) h.push({ n: i });
  return h.size() === SK.HISTORY_LIMIT && h.pop().n === SK.HISTORY_LIMIT + 4;
})());

// A stand-in database that records what was written.
var written = [];
var fakeDb = {
  put: function (store, v) { written.push('put ' + store + ' ' + v.id); return Promise.resolve(); },
  del: function (store, id) { written.push('del ' + store + ' ' + id); return Promise.resolve(); }
};
SK.applyWrites(fakeDb, [{ store: 'details', id: 'a', value: { id: 'a' } }, { store: 'sessions', id: 'z', value: null }]).then(function () {
  check('writes go to the database: a put for records, a delete for removed ones', written.join(' | ') === 'put details a | del sessions z', written.join(' | '));
  console.log(failures ? failures + ' failed' : 'all lane and history checks passed');
  process.exitCode = failures ? 1 : 0;
});
process.exitCode = failures ? 1 : 0;
