// Node tests for the cloud planner. Run from the project folder:  node tests/cloud.js
'use strict';
require('../sketch/core.js');
require('../sketch/units.js');
require('../sketch/annot.js');
require('../sketch/analyze.js');
require('../sketch/cloud.js');
var SK = globalThis.SK;
var failures = 0;
function check(name, ok, info) {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (info ? '  ' + info : ''));
  if (!ok) failures++;
}
var ac = { factor: 4, caps: true, roundTo: 1 / 16, measure: function (t, s) { return t.length * s * 0.6; } };

var wall = { id: 'w1', kind: 'stroke', t0: 0, w: 0.1, pts: [[0, 0, 0.5, 0], [0, 10, 0.5, 1000]] };
var sill = { id: 's1', kind: 'stroke', t0: 3000, w: 0.1, pts: [[0, 10, 0.5, 0], [5, 10, 0.5, 1000]] };
var detail = { id: 'd-local-1', name: 'Sill at door', scale: '3"=1\'-0"', tags: ['door'], items: [wall, sill], parentId: null, modified: 1000 };
var sessions = [
  { id: 'r-1', created: 1000, duration: 9000, base: [], events: [
      { t: 0, type: 'put', item: wall, anim: true },
      { t: 3000, type: 'put', item: sill, anim: true },
      { t: 6000, type: 'mark' }
    ], speech: [{ t: 500, text: 'Wall to the threshold' }, { t: 3500, text: 'Sill pan under the door' }],
    voice: [[0, 4000]], audioOffset: 120, audio: new Blob(['x'], { type: 'audio/webm;codecs=opus' }) },
  { id: 'r-2', created: 2000, duration: 2000, base: [], events: [], speech: [], voice: [], audio: null }
];
var an = SK.analyze(detail, sessions, ac);
var plan = SK.cloudPlan(detail, sessions, an);

check('detail row keeps its local id and tags', plan.detail.local_id === 'd-local-1' && plan.detail.tags.join() === 'door');
check('detail row carries metadata for AI readers', plan.detail.metadata.format === 'wall-sketch/metadata-1');
check('one recording row per recording', plan.recordings.length === 2);
check('recording with audio gets a path under the detail', plan.recordings[0].audio_path === 'd-local-1/r-1/audio.webm', plan.recordings[0].audio_path);
check('recording without audio has no audio path', plan.recordings[1].audio_path === null);
check('recording keeps events, speech, voice and offset', plan.recordings[0].events.length === 3 && plan.recordings[0].speech.length === 2 && plan.recordings[0].voice.length === 1 && plan.recordings[0].audio_offset_ms === 120);
check('one snapshot per scene, numbered within its recording', plan.snapshots.length === an.scenes.length && plan.snapshots[0].image_path === 'd-local-1/r-1/scene-01.jpg', plan.snapshots.map(function (s) { return s.image_path; }).join());
check('snapshot keeps its words and times', plan.snapshots[0].said.indexOf('threshold') >= 0 && plan.snapshots[0].start_ms === 0);
check('snapshot metadata lists what is on the sheet by then', Array.isArray(plan.snapshots[0].metadata.elementsOnSheet));
check('files list metadata, audio and every snapshot', plan.files.filter(function (f) { return f.kind === 'metadata'; }).length === 1 && plan.files.filter(function (f) { return f.kind === 'audio'; }).length === 1 && plan.files.filter(function (f) { return f.kind === 'snapshot'; }).length === plan.snapshots.length);
check('every file path is unique', new Set(plan.files.map(function (f) { return f.path; })).size === plan.files.length);
check('the metadata path is under the detail', plan.metadataPath === 'd-local-1/metadata.json');

// A recording with no scenes uploads its row and no snapshots
var empty = SK.cloudPlan({ id: 'd2', name: 'Empty', scale: 'NTS', tags: [], items: [], parentId: 'd-local-1', modified: 1 }, [], SK.analyze({ id: 'd2', name: 'Empty', scale: 'NTS', tags: [], items: [], parentId: null }, [], ac));
check('an empty detail plans no recordings or snapshots', empty.recordings.length === 0 && empty.snapshots.length === 0);
check('a branch records its parent by local id', empty.detail.parent_local_id === 'd-local-1');

console.log(failures ? failures + ' failed' : 'all passed');
process.exit(failures ? 1 : 0);
