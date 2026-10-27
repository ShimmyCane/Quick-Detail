// Node tests for tagging and metadata. Run from the project folder:  node tests/analyze.js
'use strict';
require('../sketch/core.js');
require('../sketch/units.js');
require('../sketch/annot.js');
require('../sketch/analyze.js');
var SK = globalThis.SK;
var failures = 0;
function check(name, ok, info) {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (info ? '  ' + info : ''));
  if (!ok) failures++;
}
var ac = { factor: 4, caps: true, roundTo: 1 / 16, measure: function (t, s) { return t.length * s * 0.6; } };

// ---- vocabulary ----
check('finds a construction word', SK.keywordTags('Set the sill pan under the threshold.').join() === 'sill pan,sill,threshold' || SK.keywordTags('Set the sill pan under the threshold.').indexOf('sill') >= 0);
check('plural and phrase matches', SK.keywordTags('air barriers and vapor barrier').sort().join() === 'air barrier,vapor barrier');
check('no false match inside a word', SK.keywordTags('the wallpaper and sillage').length === 0, SK.keywordTags('the wallpaper and sillage').join());
check('empty text gives no tags', SK.keywordTags('').length === 0 && SK.keywordTags(null).length === 0);

// ---- geometry ----
function pts(list, ms) { return list.map(function (p, i) { return [p[0], p[1], 0.5, Math.round(i * (ms || 10) / Math.max(1, list.length - 1))]; }); }
check('straight run is a line of its length', (function () {
  var g = SK.strokeGeometry({ pts: pts([[0, 0], [1, 0], [2, 0.001], [3, 0]]) });
  return g.kind === 'line' && Math.abs(g.length - 3) < 0.01;
})());
check('bent run is freehand', SK.strokeGeometry({ pts: pts([[0, 0], [1, 1], [0, 2]]) }).kind === 'freehand stroke');
check('loop is a closed shape', SK.strokeGeometry({ pts: pts([[0, 0], [2, 0], [2, 2], [0, 2], [0, 0.02]]) }).kind === 'closed shape');
check('tiny mark is a dot', SK.strokeGeometry({ pts: pts([[0, 0], [0.001, 0]]) }).kind === 'dot');

// ---- analysis ----
var wall = { id: 'w1', kind: 'stroke', t0: 0, w: 0.1, pts: pts([[0, 0], [0, 10]], 1000) };
var sill = { id: 's1', kind: 'stroke', t0: 3000, w: 0.1, pts: pts([[0, 10], [5, 10]], 1000) };
var note = { id: 'n1', kind: 'note', text: 'Membrane laps 4 in over the sill', at: [6, 2], width: 3, height: null, size: 0.09, justify: 'auto', leaders: [] };
var dim = { id: 'd1', kind: 'dim', mode: 'ortho', orient: 'h', p1: [0, 0], p2: [5, 0], at: [2, -1], size: 0.09, end: 'tick' };
var detail = { id: 'd', name: 'Sill at door', scale: '3"=1\'-0"', tags: ['door'], items: [wall, sill, note, dim], parentId: null };
var sessions = [{
  id: 'r1', created: 1000, duration: 9000, base: [],
  events: [
    { t: 0, type: 'put', item: wall, anim: true },
    { t: 3000, type: 'put', item: sill, anim: true },
    { t: 5000, type: 'put', item: note },
    { t: 6000, type: 'put', item: dim },
    { t: 6200, type: 'mark' }
  ],
  speech: [{ t: 500, text: 'Wall goes straight up' }, { t: 3500, text: 'then the sill pan' }, { t: 5200, text: 'membrane laps over the sill' }],
  voice: [[0, 2000]]
}];
var an = SK.analyze(detail, sessions, ac);
var byId = {};
an.elements.forEach(function (e) { byId[e.id] = e; });

check('line is tagged from its shape', byId.w1.type === 'line' && byId.w1.tags.indexOf('line') >= 0);
check('a spoken line tags the element drawn closest to it', byId.s1.said.indexOf('sill pan') >= 0 && byId.s1.said.indexOf('sill') >= 0, byId.s1.said.join());
check('a line spoken at the wall does not tag the sill', byId.s1.said.indexOf('wall') < 0 && byId.w1.said.indexOf('wall') >= 0, byId.w1.said.join());
check('elements remember the words that tagged them', byId.s1.why === 'then the sill pan membrane laps over the sill' || byId.s1.why === 'then the sill pan', byId.s1.why);
check('stated note text is tagged as stated', byId.n1.stated.indexOf('membrane') >= 0 && byId.n1.stated.indexOf('sill') >= 0);
check('dimension is tagged dimension with its value', byId.d1.tags.indexOf('dimension') >= 0 && byId.d1.label === 'dimension 5"');
check('scenes are numbered in time order', an.scenes.length >= 2 && an.scenes[0].index === 1 && an.scenes[0].start <= an.scenes[1].start);
check('a mark starts a scene', an.scenes.some(function (sc) { return sc.marked; }));
check('recording stats count words, voice and marks', an.recordings[0].words === 13 && an.recordings[0].voiceMs === 2000 && an.recordings[0].marks === 1, JSON.stringify(an.recordings[0]));
check('untouched elements have no scenes', SK.analyze(detail, [], ac).elements.every(function (e) { return e.scenes.length === 0; }));

var meta = SK.detailMetadata(detail, an);
check('metadata names the detail and its scale', meta.detail.name === 'Sill at door' && meta.detail.scale === '3"=1\'-0"');
check('metadata summary counts element types', /2 lines?|line/.test(meta.summary) && /dimension/.test(meta.summary), meta.summary);
check('metadata tags merge hand and element tags', meta.tags.indexOf('door') >= 0 && meta.tags.indexOf('sill') >= 0);

var sm = SK.sceneMetadata(detail, an, an.scenes[0], ['w1']);
check('scene metadata lists only elements on the sheet', sm.elementsOnSheet.length === 1 && sm.scene.index === 1);

// ---- JPEG comment round trip ----
var jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x02, 0xff, 0xd9]);
var text = JSON.stringify(meta);
var tagged = SK.jpegWithComment(jpeg, text);
check('comment keeps the image valid', tagged[0] === 0xff && tagged[1] === 0xd8 && tagged[tagged.length - 2] === 0xff && tagged[tagged.length - 1] === 0xd9);
check('comment reads back exactly', SK.jpegComment(tagged) === text);
check('plain JPEG has no comment', SK.jpegComment(jpeg) === null);
check('non-JPEG is refused', (function () { try { SK.jpegWithComment(new Uint8Array([1, 2, 3]), 'x'); return false; } catch (e) { return true; } })());
check('unicode survives', SK.jpegComment(SK.jpegWithComment(jpeg, 'Sill — 3⁄4"')) === 'Sill — 3⁄4"');

console.log(failures ? failures + ' failed' : 'all passed');
process.exit(failures ? 1 : 0);
