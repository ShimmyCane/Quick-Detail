// Quick Detail app — Log and replay.
// The log as tracks of lanes, edits to scenes (delete, notes, undo), clip playback, and the replay player in the right panel.
// Part of the app split across sketch/app/*.js. The parts share the page's global scope, so load order matters:
// see the <script> list in index.html and docs/code-map/index.html.
'use strict';

// ---- log: a film strip of every scene ----

// The bounds of everything a recording ever drew.
function sessionBounds(s) {
  var items = s.base.slice();
  s.events.forEach(function (ev) {
    if (ev.type === 'put') items.push(ev.item);
    else if (ev.type === 'replace') items = items.concat(ev.items);
  });
  return SK.itemsBounds(visible(items), acFor(detail, s.scale));
}

var thumbObserver = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
  entries.forEach(function (en) {
    if (!en.isIntersecting || !en.target._paint) return;
    en.target._paint();
    en.target._paint = null;
    thumbObserver.unobserve(en.target);
  });
}, { root: null, rootMargin: '200px' }) : null;

// ---- the log: one track per lane of the detail's tree, stacked like tracks in an editor ----
var logFamily = null;            // { details, sessions }: the open detail's tree as last read
var logCollapsed = {};           // lane id -> true when its track is folded
var logHistory = SK.History();   // undo for scene deletes and notes, since this lane was opened
var logToken = 0;

// Reads the tree: every lane of the open detail, and each lane's recordings in order.
function readFamily() {
  return SK.DB.all('details').then(function (all) {
    setDetails(all);
    var fam = SK.familyOf(all, detail.id);
    return Promise.all(fam.map(function (d) {
      return d.id === detail.id ? Promise.resolve(sessions.slice()) : SK.DB.sessionsOf(d.id);
    })).then(function (lists) {
      var recs = [];
      lists.forEach(function (list) { list.forEach(function (s) { recs.push(s); }); });
      recs.sort(function (a, b) { return (a.created || 0) - (b.created || 0); });
      return { details: fam, sessions: recs };
    });
  });
}

// The Log: a track for each lane. The open lane shows its scenes; the others show their scene words and open on a click.
function renderLog() {
  var strip = $('logStrip');
  var token = ++logToken;
  readFamily().then(function (fam) {
    if (token !== logToken) return;
    logFamily = fam;
    drawTracks(strip, fam);
  }).catch(function (e) { fail(e, 'Could not read the history: '); });
}

// Draws every track of the tree from what is in memory.
function drawTracks(strip, fam) {
  strip.innerHTML = '';
  var labels = SK.laneLabels(fam.details);
  var byId = {};
  fam.details.forEach(function (d) { byId[d.id] = d; });
  var recsOf = {};
  fam.sessions.forEach(function (s) { (recsOf[s.detailId] = recsOf[s.detailId] || []).push(s); });
  var total = 0;
  (recsOf[detail.id] || []).forEach(function (s) { total += scenesOf(s).length; });
  $('logTitle').textContent = detail.name + ' · ' + total + (total === 1 ? ' scene' : ' scenes');
  SK.laneOrder(fam.details).forEach(function (id) {
    strip.appendChild(trackFor(byId[id], recsOf[id] || [], labels, fam));
  });
}

// One lane's track: a header with its address, name, where it forks, and what was said first; then its scenes.
function trackFor(d, list, labels, fam) {
  var current = d.id === detail.id;
  var collapsed = !!logCollapsed[d.id];
  var steps = [];
  list.forEach(function (s) { scenesOf(s).forEach(function (m) { steps.push({ s: s, m: m }); }); });
  var firstSaid = '';
  for (var i = 0; i < steps.length && !firstSaid; i++) firstSaid = steps[i].m.text || '';
  var forkText = !d.parentId ? 'Main line'
    : 'Branch of ' + (labels[d.parentId] || '?') + (d.fork && d.fork.step != null ? ' · from step ' + d.fork.step : ' · fork not recorded');
  var head = el('header', { class: 'track-head', on: { click: function () {
    if (current) { logCollapsed[d.id] = !collapsed; drawTracks($('logStrip'), logFamily); }
    else openDetail(d);
  } } }, [
    el('b', { class: 'addr', text: labels[d.id] || '?' }),
    el('div', { class: 'track-title' }, [
      el('span', { class: 'track-name', text: d.name }),
      el('span', { class: 'track-fork', text: forkText }),
      el('span', { class: 'track-count', text: steps.length + (steps.length === 1 ? ' scene' : ' scenes') })
    ]),
    firstSaid ? el('p', { class: 'track-desc', text: SK.firstWords(firstSaid, 14) }) : null,
    current ? el('span', { class: 'track-tag', text: 'open' })
      : el('button', { class: 'chip', text: 'Open lane', on: { click: function (e) { e.stopPropagation(); openDetail(d); } } })
  ]);
  var body = el('div', { class: 'track-body' });
  if (!collapsed) {
    if (current) fillCurrentTrack(body, list);
    else steps.forEach(function (st, i) {
      body.appendChild(el('div', { class: 'track-word' }, [
        el('b', { text: (i + 1) + ' · ' + SK.formatTime(st.m.start) }),
        el('span', { text: st.m.text ? SK.firstWords(st.m.text, 16) : '(no words)' })
      ]));
    });
  }
  return el('section', { class: 'track' + (current ? ' current' : '') + (collapsed ? ' folded' : ''), 'data-lane': d.id }, [head, body]);
}

// The open lane's scenes: a film strip of cards, with a divider for each recording.
function fillCurrentTrack(body, list) {
  var strip = el('div', { class: 'strip' });
  body.appendChild(strip);
  if (!list.length) { strip.appendChild(el('p', { class: 'muted empty', text: 'No scenes yet. Start drawing: recording starts with the pen and stops 5 seconds after you lift it. Tap the scene button to start a new scene while you talk.' })); return; }
  var col = colors();
  var n = 0;
  list.forEach(function (s) {
    var when = new Date(s.created);
    strip.appendChild(el('div', { class: 'divider' }, [
      el('b', { text: when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }),
      el('span', { text: when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) + ' · ' + SK.formatTime(s.duration) + (s.audio ? '' : ' · no sound') })
    ]));
    var b = sessionBounds(s);
    scenesOf(s).forEach(function (m) {
      n++;
      strip.appendChild(sceneCard(s, m, n, b, col));
    });
  });
  strip.scrollLeft = strip.scrollWidth;
}

// One scene: its still, its words, the notes added to it, and its actions.
function sceneCard(s, m, num, b, col) {
  var key = SK.sceneKey(s.id, m.start);
  var thumb = el('div', { class: 'thumb' });
  var noteInput = el('textarea', { class: 'note-input', rows: '2', placeholder: 'Add a note to this scene', on: { click: function (e) { e.stopPropagation(); } } });
  var noted = (s.notes || []).filter(function (x) { return x.key === key; });
  var full = el('div', { class: 'more' }, [
    el('p', { text: m.text || 'Nothing was said in this scene.' }),
    noted.length ? el('div', { class: 'notes' }, noted.map(function (x) { return el('p', { class: 'note', text: x.text }); })) : null,
    el('div', { class: 'row' }, [
      noteInput,
      el('button', { class: 'chip', text: 'Add note', on: { click: function (e) {
        e.stopPropagation();
        var t = noteInput.value.trim();
        if (t) addNote(s, m, t);
      } } })
    ]),
    el('div', { class: 'row' }, [
      el('button', { class: 'chip', text: '▶ Clip', on: { click: function (e) { e.stopPropagation(); playClip(s, m); } } }),
      el('button', { class: 'chip', text: 'Replay', on: { click: function (e) { e.stopPropagation(); openReplay(s, m.start); } } }),
      el('button', { class: 'chip', text: 'Restore', on: { click: function (e) {
        e.stopPropagation();
        if (!window.confirm('Put the sheet back the way it was at the end of this scene? Undo brings it back.')) return;
        commitReplace(clone(SK.stateAt(s, m.end)));
        toast('Restored. Undo to go back.');
      } } }),
      el('button', { class: 'chip', text: 'Branch', on: { click: function (e) {
        e.stopPropagation();
        branchFrom(SK.stateAt(s, m.end), 'branch from scene ' + num, { step: num });
      } } }),
      el('button', { class: 'chip', text: 'Delete', on: { click: function (e) { e.stopPropagation(); deleteScene(s, m, num); } } })
    ])
  ]);
  var card = el('article', { class: 'card' + (m.marked ? ' marked' : ''), on: { click: function () { card.classList.toggle('open'); } } }, [
    thumb,
    el('b', { text: 'Scene ' + num + ' · ' + SK.formatTime(m.start) }),
    el('p', { class: 'words', text: m.text ? SK.firstWords(m.text, 8) : '(no words)' }),
    full
  ]);
  card._paint = function () {
    thumb.appendChild(SK.picture(visible(SK.stateAt(s, m.end)), b, 200, 130, { ac: acFor(detail, s.scale), ink: col.ink, paper: col.paper }));
  };
  if (thumbObserver) thumbObserver.observe(card); else card._paint();
  return card;
}

// Applies an action to the tree: remembers what it changed for undo, writes it, and redraws.
function commitLog(entry, writes) {
  logHistory.push(entry);
  return applyLogWrites(writes);
}

// Puts the writes into memory and the database, then redraws the tree.
function applyLogWrites(writes) {
  var dw = writes.filter(function (w) { return w.store === 'details'; });
  var sw = writes.filter(function (w) { return w.store === 'sessions'; });
  logFamily = { details: SK.mergeRecords(logFamily.details, dw), sessions: SK.mergeRecords(logFamily.sessions, sw) };
  dw.forEach(function (w) { if (w.value) cacheDetail(w.value); });
  sessions = logFamily.sessions.filter(function (s) { return s.detailId === detail.id; });
  updateScenes();
  drawTracks($('logStrip'), logFamily);
  return SK.applyWrites(SK.DB, writes).catch(function (e) { fail(e, 'Could not save: '); });
}

// Adds a note to a scene. Notes are kept apart from what was said.
function addNote(s, m, text) {
  var next = Object.assign({}, s, { notes: (s.notes || []).concat([{ key: SK.sceneKey(s.id, m.start), text: text, at: Date.now() }]) });
  delete next._scenes;
  commitLog({ details: [], sessions: SK.befores(logFamily.sessions, [s.id]) }, [{ store: 'sessions', id: s.id, value: next }]);
  toast('Note added.');
}

// Deletes one scene, by frame. Branches that forked after it move up one step, and a branch on it is promoted.
function deleteScene(s, m, num) {
  if (!window.confirm('Delete scene ' + num + '? Its drawing, words and notes go. Branches that came after it move up one step. Undo brings it back.')) return;
  var updates = SK.stepDeleteUpdates(logFamily.details, detail.id, num);
  var writes = [{ store: 'sessions', id: s.id, value: SK.removeScene(s, m) }];
  updates.forEach(function (u) {
    var cur = logFamily.details.filter(function (d) { return d.id === u.id; })[0];
    writes.push({ store: 'details', id: u.id, value: Object.assign({}, cur, { fork: u.fork }) });
  });
  commitLog({ details: SK.befores(logFamily.details, updates.map(function (u) { return u.id; })), sessions: SK.befores(logFamily.sessions, [s.id]) }, writes);
  toast('Scene ' + num + ' deleted. Undo brings it back.');
}

// Undoes the last delete or note in this lane.
function logUndo() {
  var entry = logHistory.pop();
  if (!entry) { toast('Nothing to undo since this lane was opened.'); return; }
  applyLogWrites(SK.undoWrites(entry));
  toast('Undone.');
}

// Opens the viewer for this detail's tree, in a new tab.
function openHistory() {
  window.open('viewer.html#' + encodeURIComponent(detail.id), '_blank');
}

$('logUndo').addEventListener('click', logUndo);
$('logHistory').addEventListener('click', openHistory);

// Plays the sound of one scene.
function playClip(s, m) {
  if (clip) { clip.pause(); URL.revokeObjectURL(clip.src); clip = null; }
  if (!s.audio) { toast('This recording has no sound.'); return; }
  var a = new Audio(URL.createObjectURL(s.audio));
  var start = Math.max(0, m.start - (s.audioOffset || 0) - 300) / 1000;
  var end = Math.max(start + 1, (m.end - (s.audioOffset || 0) + 800) / 1000);
  a.addEventListener('timeupdate', function () { if (a.currentTime >= end) a.pause(); });
  a.currentTime = start;
  a.play().catch(function () { toast('Could not play the clip.'); });
  clip = a;
}

// ---- replay ----

// Opens the replay of a recording at time T, in the right panel.
function openReplay(s, T) {
  stopRecording();
  closePanel();
  endDraft();
  select(null);
  var saved = clone(view);
  var b = sessionBounds(s);
  pb = {
    s: s, scenes: scenesOf(s), T: 0, items: [], playing: false, startT: 0, startedAt: 0, raf: 0, current: -1,
    savedView: saved, url: s.audio ? URL.createObjectURL(s.audio) : null, audio: null
  };
  if (pb.url) { pb.audio = new Audio(pb.url); pb.audio.preload = 'auto'; }
  view = SK.fitView(b, W(), H() * 0.62, 40, defaultZ(detail) * 2) || view;
  $('scrub').max = s.duration;
  var list = $('playerScenes');
  list.innerHTML = '';
  pb.scenes.forEach(function (m, i) {
    list.appendChild(el('button', { class: 'pscene', on: { click: function () { seekTo(m.start); startPlay(); } } }, [
      el('b', { text: (i + 1) + ' · ' + SK.formatTime(m.start) }),
      el('span', { text: m.text ? SK.firstWords(m.text, 8) : '(no words)' })
    ]));
  });
  document.body.classList.add('replaying');
  openPanel('playback');   // the controls sit in the right panel
  seekTo(T || 0);
}

// Shows the replay at time T: sheet, scrubber, clock and current scene.
function setT(T) {
  pb.T = Math.max(0, Math.min(T, pb.s.duration));
  pb.items = SK.stateAt(pb.s, pb.T);
  redraw();
  $('scrub').value = Math.round(pb.T);
  $('clock').textContent = SK.formatTime(pb.T) + ' / ' + SK.formatTime(pb.s.duration);
  $('playBtn').textContent = pb.playing ? '❚❚' : '▶';
  var cur = -1;
  pb.scenes.forEach(function (m, i) { if (m.start <= pb.T) cur = i; });
  if (cur !== pb.current) {
    pb.current = cur;
    var kids = $('playerScenes').children;
    for (var i = 0; i < kids.length; i++) kids[i].classList.toggle('on', i === cur);
    if (kids[cur]) kids[cur].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

// Jumps the replay, and its sound, to time T.
function seekTo(T) {
  setT(T);
  pb.startT = pb.T;
  pb.startedAt = performance.now();
  if (pb.audio) pb.audio.currentTime = Math.max(0, pb.T - (pb.s.audioOffset || 0)) / 1000;
}

// Plays the replay from where it is.
function startPlay() {
  if (!pb || pb.playing) return;
  if (pb.T >= pb.s.duration) seekTo(0);
  pb.playing = true;
  pb.startT = pb.T;
  pb.startedAt = performance.now();
  if (pb.audio) pb.audio.play().catch(function () {});
  pb.raf = requestAnimationFrame(frame);
  setT(pb.T);
}

// Pauses the replay.
function pausePlay() {
  if (!pb || !pb.playing) return;
  pb.playing = false;
  cancelAnimationFrame(pb.raf);
  if (pb.audio) pb.audio.pause();
  setT(pb.T);
}

// One animation frame of the replay.
function frame() {
  if (!pb || !pb.playing) return;
  var T = pb.startT + performance.now() - pb.startedAt;
  if (T >= pb.s.duration) { setT(pb.s.duration); pausePlay(); return; }
  setT(T);
  pb.raf = requestAnimationFrame(frame);
}

// Ends the replay and puts the view back.
function exitReplay() {
  if (!pb) return;
  pausePlay();
  if (pb.url) URL.revokeObjectURL(pb.url);
  view = pb.savedView;
  pb = null;
  parkPlayer();
  document.body.classList.remove('replaying');
  if (panelKind === 'playback') { var body = $('panelBody'); body.innerHTML = ''; renderPlayback(body); }
  redraw();
}

$('playBtn').addEventListener('click', function () { if (pb) { if (pb.playing) pausePlay(); else startPlay(); } });
$('exitBtn').addEventListener('click', exitReplay);
$('scrub').addEventListener('input', function (e) { pausePlay(); seekTo(+e.target.value); });
