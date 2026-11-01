// Quick Detail app — Shared state and helpers.
// Constants, every piece of app state (the open detail, view, undo stacks, tool, selection, recording, settings, pen),
// and the small helpers the other parts use: el(), toast(), uid(), clone(), byId(), colors(), acFor(), download().
// Part of the app split across sketch/app/*.js. The parts share the page's global scope, so load order matters:
// see the <script> list in index.html and docs/code-map/index.html.
'use strict';

var SK = window.SK;
var $ = function (id) { return document.getElementById(id); };

var AUTO_STOP_MS = 5000;     // a recording stops this long after the last pen, edit or voice
var TAP_PX = 6, TAP_MS = 300, HANDLE_PX = 14, SNAP_PX = 12, HIT_PX = 8;
var FIXED_TAGS = ['wall', 'threshold', 'door', 'window', 'roof', 'foundation'];
var ROUNDINGS = [{ v: 1 / 16, l: '1/16"' }, { v: 1 / 8, l: '1/8"' }, { v: 1 / 4, l: '1/4"' }, { v: 1 / 2, l: '1/2"' }];

var canvas = $('sheet');
var ctx = canvas.getContext('2d');
var dpr = window.devicePixelRatio || 1;

var detail = null;         // the open detail: { id, name, scale, tags, items, parentId, created, modified }
var sessions = [];         // its saved recordings
var view = { x: 0, y: 0, z: 24 };
var ops = [];              // undo stack for the open detail
var redos = [];            // undone steps, for Redo. Any new change clears it.
var tool = 'draw';         // 'draw' | 'text' | 'dim'
var dimMode = 'ortho';
var draft = null;          // a text, dimension or add-arrow step in progress
var sel = null;            // { id, leader }
var drag = null;           // a handle being dragged
var drawing = null;        // the stroke under the pen
var active = null;         // the pointer that is drawing or using a tool
var gesture = null;        // pan or pinch
var touches = {};
var penSeen = false;
var spaceDown = false;
var take = null;           // the recording in progress
var stopTimer = 0, recTimer = 0, saveTimer = 0, toastTimer = 0;
var pb = null;             // replay of a recording
var editing = null;        // a note whose text is being typed
var panelKind = null;
var clip = null;           // audio element playing a scene clip
var customTags = [];
var settings = { caps: true, roundTo: 1 / 16, bg: '#bdbdbd', grid: true, underlay: true, libBg: 'sheet', autoCollapse: false };
var ROT_PX = 26;                                // the round turn handle sits this far above a selected item
var recycleQuietUntil = 0;                      // "don't ask for five minutes" after a delete from the library
var pen = { color: 'ink', weight: 'w2', hatch: 'wood1' };   // what new strokes, notes, dimensions and hatches are drawn with
// Colour and line weight are remembered between visits. Anything unknown falls back to the defaults above.
try {
  var savedPen = JSON.parse(localStorage.getItem('qd.pen') || 'null') || {};
  if (['ink', 'red', 'blue', 'yellow', 'green'].indexOf(savedPen.color) >= 0) pen.color = savedPen.color;
  if (['w1', 'w2', 'w3', 'w4'].indexOf(savedPen.weight) >= 0) pen.weight = savedPen.weight;
} catch (err) { /* storage can be blocked; the defaults still work */ }
// Remembers the pen colour and weight between visits.
function savePen() { try { localStorage.setItem('qd.pen', JSON.stringify({ color: pen.color, weight: pen.weight })); } catch (err) { /* ignore */ } }
var DETAIL_PX_PER_PAPER_IN = 140;               // default zoom: bigger than the sheet's old 96
var counter = 0;
var sources = {}, allDetails = [];   // every detail on this device, by id, for blocks
var originHost = null;               // the detail a block was opened from, so Branch can point that block at the new version

// ===================================================================
// Helpers
// ===================================================================

// Screen width in CSS pixels.
function W() { return window.innerWidth; }
// Screen height in CSS pixels.
function H() { return window.innerHeight; }
// A new unique id, starting with prefix p (s stroke, n note, m dim, h hatch, i image, b block, d detail, r recording).
function uid(p) { counter++; return p + Date.now().toString(36) + counter.toString(36) + Math.random().toString(36).slice(2, 5); }
// A deep copy through JSON.
function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
// Distance between two points.
function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
// Index of the item with this id in a list, or -1.
function indexOf(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return i; return -1; }
// The item with this id in the open detail, or null.
function byId(id) { var i = indexOf(detail.items, id); return i < 0 ? null : detail.items[i]; }
// The detail a block points at, from the cache of every detail on this device.
function sourceOf(id) { return sources[id] || null; }
// The drawable items of a list, with blocks replaced by their sources' lines. Never edit these: their ids belong to the sources.
function visible(items) { return SK.flattenItems(items, sourceOf); }
// Whether point w hits an item, within tol. Blocks are tested through their source's lines.
function hitAt(it, w, tol, a) { return it.kind === 'block' ? SK.blockHit(it, w, tol, sourceOf, a) : SK.hitItem(it, w, tol, a); }
// Replaces the cache of every detail on this device (allDetails and sources).
function setDetails(list) {
  allDetails = list;
  sources = {};
  list.forEach(function (d) { sources[d.id] = d; });
}
// Adds or updates one detail in the cache.
function cacheDetail(d) {
  sources[d.id] = d;
  var i = indexOf(allDetails, d.id);
  if (i >= 0) allDetails[i] = d; else allDetails.push(d);
}
// Reads every detail from IndexedDB into the cache.
function loadDetails() { return SK.DB.all('details').then(function (list) { setDetails(list); return list; }); }
// Real inches per printed inch for a detail's scale.
function factorOf(d) { return SK.scaleOf(d.scale).factor; }
// The annotation context for a detail: scale factor, capitals, rounding and text measuring. Passed to annot.js and paint.js.
function acFor(d, scaleKey) {
  return { factor: SK.scaleOf(scaleKey || d.scale).factor, caps: settings.caps, roundTo: settings.roundTo, measure: SK.measure };
}
// The annotation context for the open detail.
function ac() { return acFor(detail); }
// The starting zoom for a detail: 140 screen px per printed inch.
function defaultZ(d) { return DETAIL_PX_PER_PAPER_IN / factorOf(d); }
// The sheet zooms within a sensible range, so a pinch cannot run off into nothing.
function clampZ(z) {
  var d = detail ? defaultZ(detail) : 24;
  return Math.max(d / 6, Math.min(d * 12, z));
}
// The sheet's colours. The background is a setting; black ink turns white when the background is dark.
function colors() {
  var bg = settings.bg;
  var dark = SK.luma(bg) < 0.3;
  return { ink: SK.inkFor('ink', bg), paper: bg, accent: dark ? '#7aa7ff' : '#2f6fdd' };
}
// The current pen weight in world inches.
function weightWorld() { return SK.WEIGHTS[pen.weight] * factorOf(detail); }
// Milliseconds since the take in progress started (0 when not recording).
function rel(ts) { return take ? Math.max(0, Math.round((ts == null ? performance.now() : ts) - take.t0)) : 0; }
// Makes a DOM element. attrs: text, on: { event: handler }, and plain attributes; kids: elements or strings.
function el(tag, attrs, kids) {
  var e = document.createElement(tag);
  Object.keys(attrs || {}).forEach(function (k) {
    if (k === 'text') e.textContent = attrs[k];
    else if (k === 'on') Object.keys(attrs.on).forEach(function (ev) { e.addEventListener(ev, attrs.on[ev]); });
    else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
  });
  (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return e;
}
// A short message at the bottom of the screen.
function toast(msg) {
  var t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
}
// Shows an error as a toast.
function fail(err, prefix) { toast((prefix || '') + (err && err.message ? err.message : err)); }
// A file-safe name.
function slug(s) { return String(s || 'detail').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'detail'; }
// Saves a blob as a file.
function download(blob, name) {
  var a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
}
