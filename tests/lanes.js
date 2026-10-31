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
check('first branch off step 4 is "4" (no letter)', fourOnly.a === '4', fourOnly.a);

var sameStep = SK.laneLabels([
  lane('main', null, null, 0), lane('a', 'main', 4, 1), lane('b', 'main', 4, 2), lane('c', 'main', 4, 3)
]);
check('later branches off the same step take B, C', sameStep.a === '4' && sameStep.b === '4B' && sameStep.c === '4C',
  [sameStep.a, sameStep.b, sameStep.c].join(' '));

var order = SK.laneLabels([
  lane('main', null, null, 0), lane('late', 'main', 4, 9), lane('early', 'main', 4, 2)
]);
check('letters follow creation order, not list order', order.early === '4' && order.late === '4B', order.early + ' ' + order.late);

var nested = SK.laneLabels([
  lane('main', null, null, 0), lane('a', 'main', 4, 1), lane('b', 'main', 4, 2), lane('sub', 'b', 6, 3),
  lane('sub2', 'b', 6, 4), lane('deep', 'sub', 2, 5), lane('step8', 'main', 8, 6)
]);
check('a branch off step 6 of 4B is 4B.6', nested.sub === '4B.6', nested.sub);
check('two branches off the same step inside 4B', nested.sub === '4B.6' && nested.sub2 === '4B.6B', nested.sub2);
check('a deeper branch joins the path: 4B.6.2', nested.deep === '4B.6.2', nested.deep);
check('a branch off step 8 of the main line is "8"', nested.step8 === '8', nested.step8);

var noFork = SK.laneLabels([lane('main', null, null, 0), { id: 'old', parentId: 'main', fork: null, created: 1 }]);
check('a branch without a recorded fork is "?", not guessed', noFork.old === '?', noFork.old);

var orphan = SK.laneLabels([lane('main', null, null, 0), lane('x', 'gone', 3, 1)]);
check('a lane whose parent is missing is treated as a root', orphan.x === '0', orphan.x);

// ---- versions ----
check('first version is v1', SK.versionLabel(1) === 'v1');
check('later versions count up: v2, v3', SK.versionLabel(2) === 'v2' && SK.versionLabel(3) === 'v3');
check('a missing version is v1', SK.versionLabel(undefined) === 'v1' && SK.versionLabel(0) === 'v1');

console.log(failures ? failures + ' failed' : 'all lane checks passed');
process.exitCode = failures ? 1 : 0;
