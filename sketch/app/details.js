// Quick Detail app — Details: new, open, save.
// Creating, caching, saving and opening a detail, its JSON parallel, and the live JSON file on disk.
// Part of the app split across sketch/app/*.js. The parts share the page's global scope, so load order matters:
// see the <script> list in index.html and docs/code-map/index.html.
'use strict';

// ===================================================================
// Details: open, save, new
// ===================================================================

// A sketch with no name yet is "Untitled 0001", "Untitled 0002", and so on, one past the highest in use, and tagged TEMP
// until it is renamed or the tag is removed. The digits keep them sorted in the order they were made.
function untitledName() {
  var top = 0;
  allDetails.forEach(function (d) {
    var m = /^Untitled (\d+)$/.exec(d.name || '');
    if (m) top = Math.max(top, +m[1]);
  });
  return 'Untitled ' + String(top + 1).padStart(4, '0');
}

// Drops a detail from the cache.
function uncache(id) {
  allDetails = allDetails.filter(function (d) { return d.id !== id; });
  delete sources[id];
}

// A new, unsaved detail. With no name it is Untitled 000N and tagged TEMP.
function newDetail(name) {
  return {
    id: uid('d'), name: name || untitledName(), scale: SK.DEFAULT_SCALE, tags: name ? [] : ['TEMP'], items: [],
    parentId: null, created: Date.now(), modified: Date.now(), rating: 1
  };
}

// The JSON parallel of a detail: its line work as a spec, its items, and every take with its commands.
// A take still recording is included too, as it is at this moment.
function parallelOf(d, list, live) {
  var takes = list.map(function (s) {
    return { id: s.id, created: s.created, duration: s.duration, scale: s.scale, base: s.base, events: s.events, speech: s.speech, voice: s.voice };
  });
  if (live && live.detailId === d.id) {
    takes.push({ id: 'live', created: null, duration: null, scale: live.scale, base: live.base, events: live.events, speech: live.speech, voice: live.voice, recording: true });
  }
  return SK.parallelOf(d, takes);
}
// Saves a detail and its JSON parallel to IndexedDB.
function saveDetail(d, list, live) {
  cacheDetail(d);
  return Promise.all([
    SK.DB.put('details', d),
    SK.DB.put('parallels', parallelOf(d, list, live), d.id)
  ]);
}
// Saves the open detail 400 ms after the last change.
function saveSoon() {
  clearTimeout(saveTimer);
  var d = detail, list = sessions, live = take;
  saveTimer = setTimeout(function () { saveDetail(d, list, live).catch(function (e) { fail(e, 'Could not save: '); }); }, 400);
}
// Saves the open detail now.
function saveNow() {
  clearTimeout(saveTimer);
  return saveDetail(detail, sessions, take);
}

// The live JSON file: rewritten about four times a second while you draw, and after each change.
var liveTimer = 0, liveChain = Promise.resolve();
// Rewrites the live JSON file within 250 ms, when one is linked.
function scheduleLive() {
  if (!detail || liveTimer || !SK.LiveFile.linked(detail.id)) return;
  var id = detail.id;
  liveTimer = setTimeout(function () { liveTimer = 0; writeLive(id); }, 250);
}
// Writes the open detail's parallel to its live JSON file.
function writeLive(id) {
  if (!detail || detail.id !== id || !SK.LiveFile.linked(id)) return;
  var text = JSON.stringify(parallelOf(detail, sessions, take), null, 1);
  liveChain = liveChain.then(function () { return SK.LiveFile.write(id, text); })
    .catch(function (e) { toast('Could not write the JSON file: ' + (e && e.message || e)); });
}

// A new view starts at a typical detail: 6 in. square, across the shorter side of the screen, centred on the content.
function homeView(d) {
  var z = Math.min(W(), H()) * 0.8 / 6;
  var b = SK.itemsBounds(visible(d.items), acFor(d));
  var cx = b ? (b.minx + b.maxx) / 2 : 0, cy = b ? (b.miny + b.maxy) / 2 : 0;
  return { x: cx - W() / (2 * z), y: cy - H() / (2 * z), z: z };
}

// from: the detail whose block was used to open this one (see openSource), or nothing.
function openDetail(d, from) {
  if (take) stopRecording();
  if (pb) exitReplay();
  if (detail && detail.id !== d.id) saveNow().catch(function () {});
  detail = d;
  originHost = from || null;
  ops = [];
  redos = [];
  sel = null;
  endDraft();
  view = homeView(d);
  SK.DB.put('kv', d.id, 'currentDetail').catch(function () {});
  sessions = [];
  redraw();
  updateScenes();
  loadDetails().then(function () {
    if (detail !== d) return;
    redraw();
    var users = SK.usersOf(d.id, allDetails);
    if (users.length) showBlockPopup(d, users);
  }).catch(function () {});
  return SK.DB.sessionsOf(d.id).then(function (list) {
    if (detail !== d) return;
    sessions = list.sort(function (a, b) { return a.created - b.created; });
    SK.DB.put('parallels', parallelOf(d, sessions, take), d.id).catch(function () {});   // older details get their parallel on open
    SK.LiveFile.restore(d.id).then(function (live) { if (live && detail === d) writeLive(d.id); });
    updateScenes();
    if (panelKind === 'log') renderLog();
  });
}
