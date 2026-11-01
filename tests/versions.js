// Node tests for saved versions: the ZIP container, embedded sources, relink flags and restore points.
// Run from the project folder:  node tests/versions.js
'use strict';
require('../sketch/core.js');
require('../sketch/versions.js');
var fs = require('fs');
var path = require('path');
var os = require('os');
var SK = globalThis.SK;
var failures = 0;
function check(name, ok, info) {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (info ? '  ' + info : ''));
  if (!ok) failures++;
}
var enc = new TextEncoder();
var dec = new TextDecoder();

// ---- CRC and ZIP ----
check('CRC-32 of "123456789" is the standard check value', SK.crc32(enc.encode('123456789')) === 0xCBF43926, SK.crc32(enc.encode('123456789')).toString(16));
var zip = SK.makeZip([
  { name: 'state.json', data: enc.encode('{"a":1}') },
  { name: 'points/0-3-2.png', data: new Uint8Array([137, 80, 78, 71, 0, 255]) },
  { name: 'empty.txt', data: new Uint8Array(0) },
  { name: 'ünï.json', data: enc.encode('{"u":"ü"}') }
]);
var back = SK.readZip(zip);
check('ZIP round trip keeps every file, names and bytes', Object.keys(back).length === 4 && dec.decode(back['state.json']) === '{"a":1}');
check('ZIP keeps binary bytes and empty files', back['points/0-3-2.png'].join() === '137,80,78,71,0,255' && back['empty.txt'].length === 0);
check('ZIP keeps unicode names', dec.decode(back['ünï.json']) === '{"u":"ü"}');
check('readZip refuses something that is not a zip', (function () { try { SK.readZip(enc.encode('hello world, not a zip file at all, long enough')); return false; } catch (e) { return /Not a version file/.test(e.message); } })());

// The archive must open in an independent reader, not just in ours.
var tmp = path.join(os.tmpdir(), 'qd-version-test.zip');
fs.writeFileSync(tmp, Buffer.from(zip));
var { execFileSync } = require('child_process');
var listing = '';
try { listing = execFileSync('python3', ['-m', 'zipfile', '-t', tmp], { encoding: 'utf8' }); } catch (e) { listing = 'python failed: ' + e.message; }
check('an independent zip reader accepts the archive', /OK|test/i.test(listing) && !/fail|error|bad/i.test(listing), listing.trim().slice(0, 80));
fs.unlinkSync(tmp);

// ---- embedded sources ----
var sourceA = { id: 'srcA', name: 'Membrane detail', modified: 100, items: [{ id: 'l1', kind: 'stroke' }] };
var sourceB = { id: 'srcB', name: 'Sill', modified: 50, items: [{ id: 'blk', kind: 'block', sourceId: 'srcA' }] };
var all = { srcA: sourceA, srcB: sourceB };
var sourceOf = function (id) { return all[id] || null; };
var drawing = [{ id: 'b1', kind: 'block', sourceId: 'srcB' }, { id: 'b2', kind: 'block', sourceId: 'srcA' }, { id: 'b3', kind: 'block', sourceId: 'srcA' }];
var embeds = SK.embedsOf(drawing, sourceOf);
check('each source is kept once, however many blocks use it', Object.keys(embeds).sort().join() === 'srcA,srcB');
check('a source used inside a source is kept too', embeds.srcA && embeds.srcA.items.length === 1);
check('an embedded source keeps its name and version', embeds.srcA.name === 'Membrane detail' && embeds.srcA.version === 100);
var gone = SK.embedsOf([{ id: 'x', kind: 'block', sourceId: 'nope' }], sourceOf);
check('a block whose source is already gone is left out, not guessed', Object.keys(gone).length === 0);

check('nothing is flagged while the copies match their sources', SK.embedFlags(embeds, sourceOf).length === 0);
var changedAll = { srcA: Object.assign({}, sourceA, { modified: 200 }) };
var flags = SK.embedFlags(embeds, function (id) { return changedAll[id] || null; });
var byStatus = {}; flags.forEach(function (f) { byStatus[f.sourceId] = f.status; });
check('a source changed since it was copied is flagged', byStatus.srcA === 'changed', JSON.stringify(flags));
check('a source deleted outside is flagged as missing', byStatus.srcB === 'missing');

// ---- restore points ----
var steps = [{ sessionId: 'r1', end: 1000 }, { sessionId: 'r1', end: 2000 }, { sessionId: 'r2', end: 500 }, { sessionId: 'r2', end: 900 }, { sessionId: 'r2', end: 1500 }];
var plan = SK.pointPlan(steps, [2, 4, 4, 9, 0, null]);
check('a point at each child fork and at the lane end, once each', plan.map(function (p) { return p.step + p.kind; }).join() === '2fork,4fork,5end', plan.map(function (p) { return p.step + p.kind; }).join());
check('a point carries the session and the time at that step', plan[0].sessionId === 'r1' && plan[0].T === 2000 && plan[2].sessionId === 'r2' && plan[2].T === 1500);
check('a lane with no scenes has no points', SK.pointPlan([], [1, 2]).length === 0);
check('points are named by address and step', SK.pointName('0.3.2', 2) === 'points/0-3-2-2.png' && SK.pointName('0', 5) === 'points/0-5.png');

// ---- the JSON files ----
var files = SK.versionFiles({
  version: 3, now: 0, rootId: 'dMain',
  lanes: [{ id: 'dMain', label: '0', parentId: null, fork: null, name: 'Sill', points: [{ step: 3, kind: 'fork', file: 'points/0-3.png' }] }],
  embeds: embeds
});
var state = JSON.parse(dec.decode(files['state.json']));
var manifest = JSON.parse(dec.decode(files['manifest.json']));
check('state.json carries the schema, version and embedded sources', state.schema === SK.VERSION_SCHEMA && state.version === 3 && state.embeds.srcA.version === 100);
check('manifest.json carries the tree and the points', manifest.lanes[0].label === '0' && manifest.lanes[0].points[0].file === 'points/0-3.png');

console.log(failures ? failures + ' failed' : 'all version checks passed');
process.exitCode = failures ? 1 : 0;
