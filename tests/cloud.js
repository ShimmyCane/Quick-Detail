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
check('files list the JSON parallel beside the metadata', plan.files.filter(function (f) { return f.kind === 'parallel' && /\/parallel\.json$/.test(f.path); }).length === 1);
check('every file path is unique', new Set(plan.files.map(function (f) { return f.path; })).size === plan.files.length);
check('the metadata path is under the detail', plan.metadataPath === 'd-local-1/metadata.json');
check('the rating goes up with the metadata, 1 star when none is set', plan.detail.metadata.rating === 1);
check('a set rating is kept in the metadata', SK.cloudPlan(Object.assign({}, detail, { rating: 4 }), sessions, an).detail.metadata.rating === 4);

// Large saves: size, fingerprint, and the read-back review.
function reorder(v) {   // what the database does to JSON: same values, its own key order
  if (Array.isArray(v)) return v.map(reorder);
  if (v && typeof v === 'object') { var o = {}; Object.keys(v).reverse().forEach(function (k) { o[k] = reorder(v[k]); }); return o; }
  return v;
}
var small = SK.saveSize(plan);
check('a small detail is not flagged large', !small.large && small.count === 2 && small.total === small.items + small.recordings, JSON.stringify(small));
var many = [];
for (var n = 0; n < 3000; n++) many.push({ id: 'h' + n, kind: 'stroke', w: 0.05, pts: [[n * 0.1, 0, 0.5, 0], [n * 0.1 + 0.07, 1.333333333, 0.5, 40]] });
var bigPlan = SK.cloudPlan(Object.assign({}, detail, { items: many }), sessions, an);
var big = SK.saveSize(bigPlan);
check('a 3,000-item detail is flagged large', big.large && big.count === 3000, SK.formatBytes(big.total));
check('bytes read in KB and MB', SK.formatBytes(500) === '500 bytes' && SK.formatBytes(420 * 1024) === '420 KB' && SK.formatBytes(1.5 * 1024 * 1024) === '1.5 MB');
check('the fingerprint ignores key order', SK.fingerprint(many).hash === SK.fingerprint(reorder(many)).hash);
check('the fingerprint sees a changed number', SK.fingerprint(many).hash !== SK.fingerprint(many.map(function (it, i) { return i === 900 ? Object.assign({}, it, { w: 0.06 }) : it; })).hash);
var echo = { items: reorder(bigPlan.detail.items), recordings: bigPlan.recordings.map(function (r) { return reorder({ local_id: r.local_id, base: r.base, events: r.events, speech: r.speech, voice: r.voice }); }) };
check('a faithful save reviews as confirmed', SK.reviewSave(bigPlan, echo).ok, SK.reviewSave(bigPlan, echo).problems.join('; '));
var cut = SK.reviewSave(bigPlan, Object.assign({}, echo, { items: echo.items.slice(0, 52) }));
check('a cut-off save is caught with the counts', !cut.ok && cut.problems[0] === 'the cloud has 52 items, this device sent 3000', cut.problems.join('; '));
var lost = SK.reviewSave(bigPlan, Object.assign({}, echo, { recordings: echo.recordings.slice(1) }));
check('a missing recording is caught', !lost.ok && lost.problems[0].indexOf('r-1 is missing') >= 0, lost.problems.join('; '));

// A recording with no scenes uploads its row and no snapshots
var empty = SK.cloudPlan({ id: 'd2', name: 'Empty', scale: 'NTS', tags: [], items: [], parentId: 'd-local-1', modified: 1 }, [], SK.analyze({ id: 'd2', name: 'Empty', scale: 'NTS', tags: [], items: [], parentId: null }, [], ac));
check('an empty detail plans no recordings or snapshots', empty.recordings.length === 0 && empty.snapshots.length === 0);
check('a branch records its parent by local id', empty.detail.parent_local_id === 'd-local-1');

// Cloud recycle bin, against a fake client. Purge (delete for good): media first (folders are walked), then the row.
var calls = [];
var tree = {
  'd-local-1': [{ name: 'metadata.json', id: 'f1' }, { name: 'parallel.json', id: 'f2' }, { name: 'r-1', id: null }, { name: 'r-2', id: null }],
  'd-local-1/r-1': [{ name: 'audio.webm', id: 'f3' }, { name: 'scene-01.jpg', id: 'f4' }],
  'd-local-1/r-2': []
};
SK.Cloud.client = {
  storage: { from: function (bucket) {
    return {
      list: function (path) { calls.push('list ' + path); return Promise.resolve({ data: tree[path] || [], error: null }); },
      remove: function (paths) { calls.push('remove ' + paths.join(',')); return Promise.resolve({ error: null }); }
    };
  } },
  from: function (table) {
    return { delete: function () { return { eq: function (col, val) { calls.push('delete ' + table + ' ' + col + '=' + val); return Promise.resolve({ error: null }); } }; } };
  }
};
SK.Cloud.purge({ id: 'uuid-1', local_id: 'd-local-1' }).then(function () {
  var removes = calls.filter(function (c) { return c.indexOf('remove ') === 0; });
  var rowAt = calls.findIndex(function (c) { return c.indexOf('delete ') === 0; });
  var lastRemove = calls.map(function (c, i) { return c.indexOf('remove ') === 0 ? i : -1; }).filter(function (i) { return i >= 0; }).pop();
  check('cloud delete removes every file under the detail, folders walked', removes.length === 1 && removes[0] === 'remove d-local-1/metadata.json,d-local-1/parallel.json,d-local-1/r-1/audio.webm,d-local-1/r-1/scene-01.jpg', removes.join(' | '));
  check('cloud delete removes the row by its id, after the media', rowAt > lastRemove && calls[rowAt] === 'delete sketch_details id=uuid-1', calls.join(' | '));
  check('an empty folder under the detail is walked without error', calls.indexOf('list d-local-1/r-2') >= 0 && calls.indexOf('delete sketch_details id=uuid-1') >= 0);
}).then(function () {
  // Recycle bin: soft delete and restore write deleted_at; the library reads only live rows; the bin reads only trashed rows.
  var log = [];
  var rows = [{ id: 'u-1', local_id: 'a', deleted_at: null }, { id: 'u-2', local_id: 'b', deleted_at: '2026-10-31T10:00:00Z' }];
  SK.Cloud.client = {
    from: function (table) {
      var q = { filters: [] };
      var api = {
        select: function () { return api; },
        is: function (col, val) { q.filters.push(function (r) { return r[col] === val; }); return api; },
        not: function (col, op, val) { q.filters.push(function (r) { return r[col] !== null; }); return api; },
        order: function () { return api; },
        eq: function (col, val) { log.push('eq ' + col + '=' + val); return api; },
        update: function (patch) { log.push('update ' + JSON.stringify(patch)); return { eq: function (col, val) {
          rows.forEach(function (r) { if (r[col] === val) Object.assign(r, patch); });
          return Promise.resolve({ error: null });
        } }; },
        then: function (ok) {
          var data = rows.filter(function (r) { return q.filters.every(function (f) { return f(r); }); });
          return Promise.resolve({ data: data, error: null }).then(ok);
        }
      };
      return api;
    }
  };
  var sm = SK.Cloud.softDelete('u-1');
  return sm.then(function () {
    var u1 = rows[0];
    check('soft delete writes deleted_at, not a row delete', typeof u1.deleted_at === 'string' && log.some(function (l) { return l.indexOf('update {"deleted_at":"') === 0; }), JSON.stringify(u1));
    return SK.Cloud.details();
  }).then(function (live) {
    check('the library hides trashed details (both rows are trashed at this point)', live.length === 0, 'live=' + live.length);
    return SK.Cloud.trashed();
  }).then(function (bin) {
    check('the cloud bin lists only trashed details', bin.length === 2 && bin.every(function (r) { return r.deleted_at; }), 'bin=' + bin.length);
    return SK.Cloud.restore('u-2');
  }).then(function () {
    check('restore clears deleted_at', rows[1].deleted_at === null);
  });
}).then(function () {
  console.log(failures ? failures + ' failed' : 'all passed');
  process.exit(failures ? 1 : 0);
}).catch(function (e) { console.log('FAIL cloud delete threw: ' + e.message); process.exit(1); });
