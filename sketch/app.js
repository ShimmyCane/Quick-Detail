// Sketch v3 — the page: an endless sheet in real inches, auto-recorded scenes, notes, dimensions, log, library.
(function () {
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
  function savePen() { try { localStorage.setItem('qd.pen', JSON.stringify({ color: pen.color, weight: pen.weight })); } catch (err) { /* ignore */ } }
  var DETAIL_PX_PER_PAPER_IN = 140;               // default zoom: bigger than the sheet's old 96
  var counter = 0;
  var sources = {}, allDetails = [];   // every detail on this device, by id, for blocks
  var originHost = null;               // the detail a block was opened from, so Branch can point that block at the new version

  // ===================================================================
  // Helpers
  // ===================================================================

  function W() { return window.innerWidth; }
  function H() { return window.innerHeight; }
  function uid(p) { counter++; return p + Date.now().toString(36) + counter.toString(36) + Math.random().toString(36).slice(2, 5); }
  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function indexOf(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return i; return -1; }
  function byId(id) { var i = indexOf(detail.items, id); return i < 0 ? null : detail.items[i]; }
  function sourceOf(id) { return sources[id] || null; }
  // The drawable items of a list, with blocks replaced by their sources' lines. Never edit these: their ids belong to the sources.
  function visible(items) { return SK.flattenItems(items, sourceOf); }
  function hitAt(it, w, tol, a) { return it.kind === 'block' ? SK.blockHit(it, w, tol, sourceOf, a) : SK.hitItem(it, w, tol, a); }
  function setDetails(list) {
    allDetails = list;
    sources = {};
    list.forEach(function (d) { sources[d.id] = d; });
  }
  function cacheDetail(d) {
    sources[d.id] = d;
    var i = indexOf(allDetails, d.id);
    if (i >= 0) allDetails[i] = d; else allDetails.push(d);
  }
  function loadDetails() { return SK.DB.all('details').then(function (list) { setDetails(list); return list; }); }
  function factorOf(d) { return SK.scaleOf(d.scale).factor; }
  function acFor(d, scaleKey) {
    return { factor: SK.scaleOf(scaleKey || d.scale).factor, caps: settings.caps, roundTo: settings.roundTo, measure: SK.measure };
  }
  function ac() { return acFor(detail); }
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
  function weightWorld() { return SK.WEIGHTS[pen.weight] * factorOf(detail); }
  function rel(ts) { return take ? Math.max(0, Math.round((ts == null ? performance.now() : ts) - take.t0)) : 0; }
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
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function fail(err, prefix) { toast((prefix || '') + (err && err.message ? err.message : err)); }
  function slug(s) { return String(s || 'detail').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'detail'; }
  function download(blob, name) {
    var a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

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

  function uncache(id) {
    allDetails = allDetails.filter(function (d) { return d.id !== id; });
    delete sources[id];
  }

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
  function saveDetail(d, list, live) {
    cacheDetail(d);
    return Promise.all([
      SK.DB.put('details', d),
      SK.DB.put('parallels', parallelOf(d, list, live), d.id)
    ]);
  }
  function saveSoon() {
    clearTimeout(saveTimer);
    var d = detail, list = sessions, live = take;
    saveTimer = setTimeout(function () { saveDetail(d, list, live).catch(function (e) { fail(e, 'Could not save: '); }); }, 400);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    return saveDetail(detail, sessions, take);
  }

  // The live JSON file: rewritten about four times a second while you draw, and after each change.
  var liveTimer = 0, liveChain = Promise.resolve();
  function scheduleLive() {
    if (!detail || liveTimer || !SK.LiveFile.linked(detail.id)) return;
    var id = detail.id;
    liveTimer = setTimeout(function () { liveTimer = 0; writeLive(id); }, 250);
  }
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

  // ===================================================================
  // Changes: every edit goes through these, for undo and for the recording
  // ===================================================================

  function logEvent(ev) {
    if (!take) return;
    if (ev.t == null) ev.t = rel();
    take.events.push(ev);
    activity();
  }

  function changed() {
    detail.modified = Date.now();
    saveSoon();
    scheduleLive();
    if (sel && !byId(sel.id)) sel = null;
    renderChips();
    redraw();
  }

  function setItem(item) {
    var i = indexOf(detail.items, item.id);
    if (i >= 0) detail.items[i] = item; else detail.items.push(item);
  }

  function commitPut(item, before, anim) {
    setItem(item);
    ops.push({ type: 'put', before: before || null, after: item });
    redos = [];
    logEvent({ type: 'put', item: clone(item), anim: !!anim, t: anim ? item.t0 : null });
    changed();
  }

  function commitDel(id) {
    var i = indexOf(detail.items, id);
    if (i < 0) return;
    var before = detail.items.splice(i, 1)[0];
    ops.push({ type: 'del', before: before, index: i });
    redos = [];
    logEvent({ type: 'del', id: id });
    changed();
  }

  function commitReplace(items) {
    ops.push({ type: 'replace', before: detail.items, after: items });
    redos = [];
    detail.items = items;
    logEvent({ type: 'replace', items: clone(items) });
    changed();
  }

  function undo() {
    if (pb || drawing || editing) return;
    var op = ops.pop();
    if (!op) { toast('Nothing to undo.'); return; }
    if (op.type === 'put') {
      if (op.before) { setItem(op.before); logEvent({ type: 'put', item: clone(op.before) }); }
      else {
        var i = indexOf(detail.items, op.after.id);
        if (i >= 0) detail.items.splice(i, 1);
        logEvent({ type: 'del', id: op.after.id });
      }
    } else if (op.type === 'del') {
      detail.items.splice(Math.min(op.index, detail.items.length), 0, op.before);
      logEvent({ type: 'put', item: clone(op.before) });
    } else if (op.type === 'replace') {
      op.after = detail.items;
      detail.items = op.before;
      logEvent({ type: 'replace', items: clone(op.before) });
    } else if (op.type === 'meta') {
      op.after = detail[op.key];
      detail[op.key] = op.before;
    }
    redos.push(op);
    changed();
  }

  // Redo puts back the step that undo took away. Works the same way for each kind of step.
  function redo() {
    if (pb || drawing || editing) return;
    var op = redos.pop();
    if (!op) { toast('Nothing to redo.'); return; }
    if (op.type === 'put') {
      var put = clone(op.after);
      setItem(put);
      logEvent({ type: 'put', item: clone(put) });
    } else if (op.type === 'del') {
      var i = indexOf(detail.items, op.before.id);
      if (i >= 0) detail.items.splice(i, 1);
      logEvent({ type: 'del', id: op.before.id });
    } else if (op.type === 'replace') {
      detail.items = clone(op.after);
      logEvent({ type: 'replace', items: clone(detail.items) });
    } else if (op.type === 'meta') {
      detail[op.key] = op.after;
    }
    ops.push(op);
    changed();
  }

  // ===================================================================
  // Recording: starts with the pen, stops 5 s after the last activity. The scene button forces a new scene.
  // ===================================================================

  function ensureTake() {
    if (take || pb) return;
    take = SK.startTake(clone(detail.items), activity);
    take.detailId = detail.id;
    take.scale = detail.scale;
    showRec(true);
  }

  // Something happened: push the auto-stop back. Never stops while a pointer is down.
  function activity() {
    if (!take) return;
    clearTimeout(stopTimer);
    if (active || drag) return;
    stopTimer = setTimeout(stopRecording, AUTO_STOP_MS);
  }

  function stopRecording() {
    var r = take;
    if (!r) return Promise.resolve();
    take = null;
    clearTimeout(stopTimer);
    showRec(false);
    return SK.stopTake(r).then(function (res) {
      if (!r.events.length && !r.speech.length) { updateScenes(); return; }
      var s = {
        id: uid('r'), detailId: r.detailId, created: Date.now() - res.duration, duration: res.duration,
        scale: r.scale, base: r.base, events: r.events, speech: r.speech, voice: r.voice,
        audioOffset: r.audioOffset, audio: res.audio
      };
      return SK.DB.put('sessions', s).then(function () {
        if (detail && detail.id === s.detailId) { sessions.push(s); saveSoon(); scheduleLive(); }
        updateScenes();
        if (panelKind === 'log') renderLog();
      });
    }).catch(function (e) { fail(e, 'Could not save the recording: '); });
  }

  function newScene() {
    if (pb) return;
    ensureTake();
    logEvent({ type: 'mark' });
    var f = $('flash');
    f.hidden = false;
    f.classList.remove('go');
    void f.offsetWidth;
    f.classList.add('go');
    setTimeout(function () { f.hidden = true; }, 400);
    updateScenes();
  }

  function scenesOf(s) { return s._scenes || (s._scenes = SK.segment(s)); }

  function updateScenes() {
    var n = 0;
    sessions.forEach(function (s) { n += scenesOf(s).length; });
    if (take) n += SK.segment(take).length;
    $('sceneCount').textContent = n;
  }

  function showRec(on) {
    $('recDot').hidden = !on;
    $('sceneBtn').classList.toggle('live', on);
    clearInterval(recTimer);
    if (on) {
      $('recTime').textContent = '00:00';
      recTimer = setInterval(function () {
        $('recTime').textContent = SK.formatTime(rel());
        updateScenes();
      }, 500);
    }
  }

  // ===================================================================
  // Painting
  // ===================================================================

  function resize() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W() * dpr);
    canvas.height = Math.round(H() * dpr);
    redraw();
  }

  function redraw() {
    if (!detail) return;
    var col = colors();
    var list = pb ? pb.items : detail.items;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = col.paper;
    ctx.fillRect(0, 0, W(), H());
    if (settings.grid && !pb) SK.paintGrid(ctx, view, factorOf(detail), W(), H(), dpr, settings.bg);
    if (settings.underlay) list.forEach(function (it) { if (it.kind === 'block') drawUnderlay(it, col); });
    SK.paint(ctx, visible(list.filter(function (it) { return it.kind !== 'block'; })), view, { ac: pb ? acFor(detail, pb.s.scale) : ac(), ink: col.ink, paper: col.paper, bg: col.paper, fill: false, ratio: dpr, w: W(), h: H(), hideUnderlay: !settings.underlay });
    SK.missingBlocks(list, sourceOf).forEach(function (bk) { drawPlaceholder(bk, col); });
    if (!pb) {
      drawDraft(col);
      drawSelection(col);
    }
    updateTitle();
  }

  function marker(p, col, filled) {
    var s = SK.toScreen(view, p);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = col.accent;
    ctx.fillStyle = col.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(s[0], s[1], 5, 0, Math.PI * 2);
    if (filled) ctx.fill(); else ctx.stroke();
  }

  function drawDraft(col) {
    if (!draft) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (draft.tool === 'hatch' && draft.start && draft.cur) {
      var h0 = SK.toScreen(view, draft.start), h1 = SK.toScreen(view, draft.cur);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = col.accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.min(h0[0], h1[0]), Math.min(h0[1], h1[1]), Math.abs(h1[0] - h0[0]), Math.abs(h1[1] - h0[1]));
      ctx.setLineDash([]);
    }
    if (draft.cur && draft.snapKind) marker(draft.cur, col, draft.snapKind === 'point');
    if (draft.tool === 'text') {
      if (draft.tip) marker(draft.tip, col, true);
      if (draft.tip && draft.cur) {
        var a = SK.toScreen(view, draft.tip), b = SK.toScreen(view, draft.start || draft.cur);
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = col.accent;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        if (draft.start) {
          var c = SK.toScreen(view, draft.cur);
          var hpx = SK.PAPER.text * factorOf(detail) * 1.5 * view.z;
          ctx.strokeRect(Math.min(b[0], c[0]), b[1], Math.abs(c[0] - b[0]), hpx);
        }
        ctx.setLineDash([]);
      }
    } else if (draft.tool === 'dim') {
      draft.pts.forEach(function (p) { marker(p, col, true); });
      if (draft.placing && draft.cur) {
        SK.paint(ctx, [buildDim(draft.cur)], view, { ac: ac(), ink: col.accent, paper: col.paper, ratio: dpr, fill: false, w: W(), h: H() });
      }
    }
  }

  function handlesOf(it) {
    var a = ac();
    if (it.kind === 'note') {
      var L = SK.noteLayout(it, a), b = L.box;
      var hs = (it.leaders || []).map(function (ld, i) { return { key: 'tip:' + i, p: ld.tip }; });
      return hs.concat([
        { key: 'move', p: [b.x, b.y] },
        { key: 'width', p: [b.x + b.w, b.y + b.h / 2] },
        { key: 'height', p: [b.x + b.w / 2, b.y + b.h] }
      ]);
    }
    if (it.kind === 'dim') {
      var hs2 = [{ key: 'p1', p: it.p1 }, { key: 'p2', p: it.p2 }];
      if (it.mode === 'angular') {
        hs2.push({ key: 'vertex', p: it.vertex }, { key: 'at', p: it.at });
      } else {
        var lay = SK.dimLayout(it, a);
        hs2.push({ key: 'at', p: [(lay.A[0] + lay.B[0]) / 2, (lay.A[1] + lay.B[1]) / 2] });
      }
      return hs2;
    }
    if (it.kind === 'block') return sourceOf(it.sourceId) ? boxHandles(SK.blockBounds(it, sourceOf, a)) : [];
    if (it.kind === 'stroke' || it.kind === 'hatch') return boxHandles(SK.itemBounds(it, a));
    if (it.kind === 'image') return [{ key: 'move', p: it.at }, { key: 'size', p: [it.at[0] + it.w, it.at[1] + it.h] }];
    return [];
  }

  // A block is an underlay: drawn faint under the linework, at the block's own opacity.
  function drawUnderlay(bk, col) {
    SK.paint(ctx, visible([bk]), view, { ac: ac(), ink: col.ink, paper: col.paper, bg: col.paper, fill: false, ratio: dpr, w: W(), h: H(), alpha: bk.opacity == null ? 0.4 : bk.opacity });
  }

  // A block whose source is not on this device: a dashed box with its name, so it can still be selected and erased.
  function drawPlaceholder(bk, col) {
    var b = SK.blockPlaceholder(bk, ac());
    var p = SK.toScreen(view, [b.minx, b.miny]), q = SK.toScreen(view, [b.maxx, b.maxy]);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = col.ink;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(p[0], p[1], q[0] - p[0], q[1] - p[1]);
    ctx.setLineDash([]);
    ctx.fillStyle = col.ink;
    ctx.font = '14px sans-serif';
    ctx.fillText('Block: source not on this device', p[0] + 8, p[1] + 20);
  }

  function drawSelection(col) {
    if (!sel) return;
    var it = byId(sel.id);
    if (!it) return;
    var b = it.kind === 'block' ? SK.blockBounds(it, sourceOf, ac()) : SK.itemBounds(it, ac());
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = col.accent;
    ctx.lineWidth = 1;
    if (b) {
      var p = SK.toScreen(view, [b.minx, b.miny]), q = SK.toScreen(view, [b.maxx, b.maxy]);
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(p[0] - 4, p[1] - 4, q[0] - p[0] + 8, q[1] - p[1] + 8);
      ctx.setLineDash([]);
    }
    // An underlay shows its outline only; its handles wait for the arrow tool.
    var handles = tool === 'select' || !SK.isUnderlay(it) ? handlesOf(it) : [];
    handles.forEach(function (h) {
      var s = SK.toScreen(view, h.p);
      var on = sel.leader != null && h.key === 'tip:' + sel.leader;
      ctx.fillStyle = on ? col.accent : col.paper;
      ctx.fillRect(s[0] - 5, s[1] - 5, 10, 10);
      ctx.strokeRect(s[0] - 5, s[1] - 5, 10, 10);
    });
  }

  // Live pen: only the newest piece is painted; the whole stroke is repainted on pen up.
  function drawPiece(item, a, b) {
    var col = colors();
    var sa = SK.toScreen(view, a), sb = SK.toScreen(view, b);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = col.ink;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(item.w * (0.55 + 0.9 * b[2]) * view.z, 0.5);
    ctx.beginPath();
    ctx.moveTo(sa[0], sa[1]);
    ctx.lineTo(sb[0] + 0.01, sb[1]);
    ctx.stroke();
  }

  // A round real length for the scale bar: eighths of an inch under a foot, then whole feet.
  function niceLength(inches) {
    if (inches < 12) {
      var step = inches < 1 ? 1 / 8 : inches < 3 ? 1 / 4 : 1 / 2;
      return Math.max(step, Math.round(inches / step) * step);
    }
    var ft = inches / 12;
    var fstep = ft < 10 ? 1 : ft < 40 ? 5 : 10;
    return Math.max(12, Math.round(ft / fstep) * fstep * 12);
  }
  function updateTitle() {
    if (!detail) return;
    $('titleName').textContent = detail.name || 'Untitled detail';
    $('scaleLabel').textContent = detail.scale === 'NTS' ? 'NOT TO SCALE' : 'SCALE: ' + SK.scaleOf(detail.scale).label;
    // A graphic scale of fixed length. Its label is the real length it stands for at this zoom and scale, so the
    // label changes from inches to feet as you zoom while the bar itself stays the same length.
    var BAR_PX = 110;
    $('scaleBar').style.width = BAR_PX + 'px';
    $('barLabel').textContent = SK.formatLength(niceLength(BAR_PX / view.z), 1 / 8);
  }

  // ===================================================================
  // Input routing: pen draws, fingers pan once a pen is seen, two fingers pinch, wheel zooms
  // ===================================================================

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    SK.Mic.resume();
    if (editing) { closeEditor(true); return; }
    if (panelKind && panelKind !== 'log') closePanel();
    if (e.pointerType === 'pen') penSeen = true;
    var sp = [e.clientX, e.clientY];
    if (e.pointerType === 'touch') {
      touches[e.pointerId] = sp;
      var ids = Object.keys(touches);
      if (ids.length >= 2) { abortStroke(); active = null; startPinch(ids); return; }
      if (penSeen || pb) { startPan(e, sp); return; }
    } else if (e.pointerType === 'mouse' && (e.button === 1 || e.button === 2 || spaceDown || pb)) {
      startPan(e, sp);
      return;
    }
    if (pb) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    active = { id: e.pointerId, s0: sp, t0: performance.now(), moved: false };
    clearTimeout(stopTimer);
    toolDown(e, sp);
  });

  canvas.addEventListener('pointermove', function (e) {
    var sp = [e.clientX, e.clientY];
    if (touches[e.pointerId]) touches[e.pointerId] = sp;
    if (gesture) { moveGesture(e, sp); return; }
    if (active && e.pointerId === active.id) {
      if (dist(sp, active.s0) > TAP_PX) active.moved = true;
      toolMove(e, sp);
    } else if (!active && e.pointerType === 'mouse' && draft) {
      draftMove(SK.toWorld(view, sp));
    }
  });

  function pointerEnd(e) {
    delete touches[e.pointerId];
    if (gesture) {
      if (gesture.kind === 'pan' && gesture.id === e.pointerId) gesture = null;
      else if (gesture.kind === 'pinch' && Object.keys(touches).length < 2) gesture = null;
      return;
    }
    if (active && e.pointerId === active.id) {
      var a = active;
      active = null;
      toolUp(e, [e.clientX, e.clientY], a);
      activity();
    }
  }
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) zoomAt([e.clientX, e.clientY], Math.exp(-e.deltaY * 0.01));
    else {
      view.x += e.deltaX / view.z;
      view.y += e.deltaY / view.z;
      redraw();
    }
  }, { passive: false });

  function zoomAt(sp, k) {
    var w = SK.toWorld(view, sp);
    view.z = clampZ(view.z * k);
    view.x = w[0] - sp[0] / view.z;
    view.y = w[1] - sp[1] / view.z;
    redraw();
  }

  function startPan(e, sp) {
    canvas.setPointerCapture(e.pointerId);
    gesture = { kind: 'pan', id: e.pointerId, s0: sp, v0: clone(view) };
  }
  function startPinch(ids) {
    var a = touches[ids[0]], b = touches[ids[1]];
    gesture = { kind: 'pinch', ids: ids.slice(0, 2), v0: clone(view), c0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], d0: Math.max(dist(a, b), 1) };
  }
  function moveGesture(e, sp) {
    var g = gesture;
    if (g.kind === 'pan') {
      if (e.pointerId !== g.id) return;
      view.x = g.v0.x - (sp[0] - g.s0[0]) / view.z;
      view.y = g.v0.y - (sp[1] - g.s0[1]) / view.z;
    } else {
      var a = touches[g.ids[0]], b = touches[g.ids[1]];
      if (!a || !b) return;
      var c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      var w0 = SK.toWorld(g.v0, g.c0);
      view.z = clampZ(g.v0.z * dist(a, b) / g.d0);
      view.x = w0[0] - c[0] / view.z;
      view.y = w0[1] - c[1] / view.z;
    }
    redraw();
  }

  // Zoom extents: fit everything on the sheet in view.
  function fitAll() {
    var b = SK.itemsBounds(visible(detail.items), ac());
    view = SK.fitView(b, W(), H(), 40, defaultZ(detail) * 3) || homeView(detail);
    redraw();
  }

  // ===================================================================
  // Tools
  // ===================================================================

  function toolDown(e, sp) {
    var w = SK.toWorld(view, sp);
    if (tool === 'erase') { eraseAt(w); return; }
    if (tool === 'select') { selectDown(e, sp, w); return; }
    // Drawing tools never take an underlay: a selected image or block is moved only with the arrow tool, so the pen goes over it.
    if (sel && !selectedUnderlay()) {
      var h = hitHandle(sp);
      if (h) { startHandleDrag(h, w); return; }
    }
    if (draft) { draftDown(w); return; }
    startStroke(e, w);
  }

  function toolMove(e, sp) {
    var w = SK.toWorld(view, sp);
    if (tool === 'erase') { eraseAt(w); return; }
    if (drag) { moveHandleDrag(w); return; }
    if (drawing) {
      var list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      if (!list.length) list = [e];
      list.forEach(function (ev) {
        var it = drawing.item;
        var before = it.pts[it.pts.length - 1];
        if (addPoint(ev) && before) drawPiece(it, before, it.pts[it.pts.length - 1]);
      });
      return;
    }
    if (draft) draftMove(w);
  }

  function toolUp(e, sp, a) {
    var w = SK.toWorld(view, sp);
    if (drag) { endHandleDrag(); return; }
    if (drawing) {
      var it = drawing.item;
      drawing = null;
      var i = indexOf(detail.items, it.id);
      if (i >= 0) detail.items.splice(i, 1);
      if (!a.moved && performance.now() - a.t0 < TAP_MS) {
        var hit = hitAnnotation(w);
        if (hit) { select(hit.id); return; }
        if (sel) { select(null); return; }
      }
      commitPut(it, null, true);
      return;
    }
    if (draft) draftUp(w);
  }

  // ---- pen strokes ----

  function startStroke(e, w) {
    ensureTake();
    var it = { id: uid('s'), kind: 'stroke', t0: rel(e.timeStamp), w: weightWorld(), c: pen.color, pts: [] };
    drawing = { item: it };
    detail.items.push(it);
    addPoint(e);
    drawPiece(it, it.pts[0], it.pts[0]);
  }

  function addPoint(e) {
    var it = drawing.item;
    var w = SK.toWorld(view, [e.clientX, e.clientY]);
    var last = it.pts[it.pts.length - 1];
    if (last && dist(w, last) * view.z < 1.5) return false;
    var r = function (n) { return Math.round(n * 1e4) / 1e4; };
    it.pts.push([r(w[0]), r(w[1]), r(e.pressure > 0 ? e.pressure : 0.5), Math.max(0, rel(e.timeStamp) - it.t0)]);
    scheduleLive();
    return true;
  }

  function abortStroke() {
    if (!drawing) return;
    var i = indexOf(detail.items, drawing.item.id);
    if (i >= 0) detail.items.splice(i, 1);
    drawing = null;
    redraw();
  }

  // ---- hits and snapping ----

  // Erases the top element under the point: a whole stroke, note, dimension or hatch. Undo brings it back.
  function eraseAt(w) {
    var tol = 10 / view.z, a = ac();
    for (var i = detail.items.length - 1; i >= 0; i--) {
      if (detail.items[i].kind === 'image' || detail.items[i].kind === 'block') continue;   // underlays are removed with Delete, so erasing over one is safe
      if (hitAt(detail.items[i], w, tol, a)) { commitDel(detail.items[i].id); return true; }
    }
    return false;
  }

  // A closed stroke under the point, for hatching by tapping inside it.
  function closedShapeAt(w) {
    for (var i = detail.items.length - 1; i >= 0; i--) {
      var it = detail.items[i];
      if (it.kind === 'stroke' && it.pts.length > 2 && SK.strokeGeometry(it).kind === 'closed shape' && SK.pointInPoly(w, it.pts)) return it;
    }
    return null;
  }

  // A tap with a drawing tool picks a note, dimension or hatch, top first. Underlays are left to the arrow tool.
  function hitAnnotation(w) {
    var tol = HIT_PX / view.z, a = ac();
    for (var i = detail.items.length - 1; i >= 0; i--) {
      var it = detail.items[i];
      if (it.kind === 'stroke' || SK.isUnderlay(it)) continue;
      if (hitAt(it, w, tol, a)) return it;
    }
    return null;
  }

  // The item under the point, top first. Linework (strokes too) is picked before underlays. Used by the select tool.
  function pickAt(w) {
    var tol = HIT_PX / view.z, a = ac();
    for (var pass = 0; pass < 2; pass++) {
      for (var i = detail.items.length - 1; i >= 0; i--) {
        var it = detail.items[i];
        var under = it.kind === 'image' || it.kind === 'block';
        if (under !== (pass === 1) || (under && !settings.underlay)) continue;
        if (hitAt(it, w, tol, a)) return it;
      }
    }
    return null;
  }

  // Select mode: the selected item's handles first, then the item under the pen. Empty space pans the sheet.
  function selectDown(e, sp, w) {
    if (sel) {
      var h = hitHandle(sp);
      if (h) { startHandleDrag(h, w); return; }
    }
    var it = pickAt(w);
    if (it) {
      select(it.id);
      startHandleDrag({ key: 'move' }, w);
      return;
    }
    if (sel) select(null);
    active = null;
    startPan(e, sp);
  }

  // Handles for a box: the bottom-right corner scales, and a round handle above the top edge turns.
  function boxHandles(b) {
    if (!b) return [];
    return [{ key: 'size', p: [b.maxx, b.maxy] }, { key: 'rot', p: [(b.minx + b.maxx) / 2, b.miny - ROT_PX / view.z] }];
  }

  function hitHandle(sp) {
    var it = byId(sel.id);
    if (!it) return null;
    var hs = handlesOf(it);
    for (var i = 0; i < hs.length; i++) {
      if (dist(SK.toScreen(view, hs[i].p), sp) <= HANDLE_PX) return hs[i];
    }
    return null;
  }

  function snapAt(w, exceptId) {
    var list = visible(detail.items).filter(function (it) { return it.id !== exceptId; });
    return SK.snap(list, w, SNAP_PX / view.z);
  }

  // ---- handle drags ----

  function startHandleDrag(h, w) {
    var it = byId(sel.id);
    var box = it.kind === 'block' ? SK.blockBounds(it, sourceOf, ac()) : (it.kind === 'stroke' || it.kind === 'hatch') ? SK.itemBounds(it, ac()) : null;
    var c = box ? [(box.minx + box.maxx) / 2, (box.miny + box.maxy) / 2] : null;
    drag = { id: it.id, key: h.key, before: it, w0: w, box: box, c: c, a0: c ? Math.atan2(w[1] - c[1], w[0] - c[0]) : 0 };
    if (h.key.indexOf('tip:') === 0) { sel.leader = +h.key.slice(4); renderChips(); }
  }

  function moveHandleDrag(w) {
    var b = drag.before, it = clone(b), k = drag.key;
    var snapped = function () { return snapAt(w, b.id).p; };
    var f = factorOf(detail);
    if (k.indexOf('tip:') === 0) it.leaders[+k.slice(4)].tip = snapped();
    else if (k === 'move' && (b.kind === 'stroke' || b.kind === 'hatch')) {
      var dx = w[0] - drag.w0[0], dy = w[1] - drag.w0[1];
      it = SK.transformItem(b, function (p) { return [p[0] + dx, p[1] + dy]; }, 1, 0);
    }
    else if (k === 'move') it.at = [b.at[0] + w[0] - drag.w0[0], b.at[1] + w[1] - drag.w0[1]];
    else if (k === 'size' && (b.kind === 'stroke' || b.kind === 'hatch')) {
      var q = drag.box, s = Math.max(0.05, (w[0] - q.minx) / Math.max(q.maxx - q.minx, 1e-6));
      it = SK.transformItem(b, function (p) { return [q.minx + s * (p[0] - q.minx), q.miny + s * (p[1] - q.miny)]; }, s, 0);
    }
    else if (k === 'rot') {
      var ang = Math.atan2(w[1] - drag.c[1], w[0] - drag.c[0]) - drag.a0, cs = Math.cos(ang), sn = Math.sin(ang);
      var cx = drag.c[0], cy = drag.c[1];
      it = SK.transformItem(b, function (p) { var x = p[0] - cx, y = p[1] - cy; return [cx + cs * x - sn * y, cy + sn * x + cs * y]; }, 1, ang);
    }
    else if (k === 'width') it.width = Math.max(SK.PAPER.text * f * 4, w[0] - b.at[0]);
    else if (k === 'height') it.height = Math.max(SK.PAPER.text * f * 1.5, w[1] - b.at[1]);
    else if (k === 'size' && b.kind === 'block') {
      var bx = drag.box;
      scaleBlockTo(it, bx, SK.blockScale(b) * (w[0] - bx.minx) / Math.max(bx.maxx - bx.minx, 1e-6));
    }
    else if (k === 'size') { it.w = Math.max(f / 4, w[0] - b.at[0]); it.h = it.w * b.h / b.w; }   // keeps the image's proportions
    else if (k === 'p1' || k === 'p2' || k === 'vertex') it[k] = snapped();
    else if (k === 'at') {
      it.at = w;
      if (it.mode === 'ortho') it.orient = SK.orthoOrient(it.p1, it.p2, w);
    }
    setItem(it);
    redraw();
  }

  // Sets a block's scale to k, keeping its top-left corner at box (the block's bounds before the change).
  function scaleBlockTo(it, box, k) {
    var src = sourceOf(it.sourceId);
    if (!src) return;
    var own = SK.itemsBounds(visible(src.items || []), acFor(src)) || { minx: 0, miny: 0 };
    it.k = Math.min(20, Math.max(0.05, k));
    it.at = [box.minx - it.k * own.minx, box.miny - it.k * own.miny];
  }

  function endHandleDrag() {
    var d = drag;
    drag = null;
    var after = byId(d.id);
    if (after && JSON.stringify(after) !== JSON.stringify(d.before)) commitPut(after, d.before);
    else redraw();
  }

  // ---- text, dimension and add-arrow steps ----

  function setTool(t) {
    var same = tool === t;
    endDraft();
    select(null);
    if (same && t !== 'select') return;
    tool = t;
    if (t === 'select') showHint('Tap to pick up. Drag to move. Corner: scale. Round handle: turn. Drag empty space to pan.');
    if (t === 'text') {
      draft = { tool: 'text', step: 0 };
      showHint('Tap the arrow point.');
    } else if (t === 'dim') {
      draft = { tool: 'dim', mode: dimMode, pts: [] };
      showDimHint();
    } else if (t === 'hatch') {
      draft = { tool: 'hatch', start: null, cur: null };
      showHatchHint();
    } else if (t === 'erase') {
      showHint('Tap or drag over what to delete. Undo brings it back.');
    }
    document.querySelectorAll('.rail [data-act], #lrail [data-act]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-act') === t); });
  }

  function endDraft() {
    draft = null;
    tool = 'draw';
    $('hint').hidden = true;
    document.querySelectorAll('.rail [data-act], #lrail [data-act]').forEach(function (b) { b.classList.remove('on'); });
    redraw();
  }

  function showHint(text, extra) {
    $('hintText').textContent = text;
    var x = $('hintExtra');
    x.innerHTML = '';
    (extra || []).forEach(function (n) { x.appendChild(n); });
    $('hint').hidden = false;
  }

  function showHatchHint() {
    var pick = el('select', { class: 'field', 'aria-label': 'Hatch pattern', on: { change: function (e) { pen.hatch = e.target.value; } } });
    SK.HATCHES.forEach(function (h) {
      if (h.key !== 'none') pick.appendChild(el('option', { value: h.key, text: h.label, selected: h.key === pen.hatch }));
    });
    showHint('Drag a rectangle, or tap inside a closed shape.', [pick]);
  }

  function showDimHint() {
    var need = draft.mode === 'angular' ? 3 : 2;
    var labels = draft.mode === 'angular'
      ? ['Tap the corner (vertex).', 'Tap a point on the first side.', 'Tap a point on the second side.']
      : ['Tap the first point.', 'Tap the second point.'];
    var text = draft.placing ? 'Drag out the dimension line, then let go.' : labels[Math.min(draft.pts.length, need - 1)];
    var modes = ['ortho', 'aligned', 'angular'].map(function (m) {
      return el('button', { class: 'chip' + (draft.mode === m ? ' on' : ''), text: m[0].toUpperCase() + m.slice(1), on: { click: function () {
        dimMode = m;
        draft = { tool: 'dim', mode: m, pts: [] };
        showDimHint();
        redraw();
      } } });
    });
    showHint(text, modes);
  }

  function draftDown(w) {
    if (draft.tool === 'hatch') { draft.start = w; draft.cur = w; redraw(); return; }
    if (draft.tool === 'text' && draft.step === 1) { draft.start = w; draft.cur = w; draft.snapKind = null; }
    else draftMove(w);
  }

  function draftMove(w) {
    if (draft.tool === 'hatch') { draft.cur = w; redraw(); return; }
    var placing = (draft.tool === 'text' && draft.step === 1) || (draft.tool === 'dim' && draft.placing);
    if (placing) { draft.cur = w; draft.snapKind = null; }
    else {
      var s = snapAt(w);
      draft.cur = s.p;
      draft.snapKind = s.kind;
    }
    redraw();
  }

  function hatchUp(w) {
    var s0 = draft.start || w;
    var moved = Math.abs(w[0] - s0[0]) + Math.abs(w[1] - s0[1]);
    var poly, outline;
    if (moved * view.z > 8) {
      var x0 = Math.min(s0[0], w[0]), x1 = Math.max(s0[0], w[0]), y0 = Math.min(s0[1], w[1]), y1 = Math.max(s0[1], w[1]);
      poly = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      outline = true;
    } else {
      var shape = closedShapeAt(w);
      draft.start = null;
      draft.cur = null;
      if (!shape) { toast('Drag a rectangle, or tap inside a closed shape.'); redraw(); return; }
      poly = shape.pts.map(function (p) { return [p[0], p[1]]; });
      outline = false;
    }
    draft.start = null;
    draft.cur = null;
    commitPut({ id: uid('h'), kind: 'hatch', pattern: pen.hatch, pts: poly, outline: outline, c: pen.color }, null);
  }

  function draftUp(w) {
    if (draft.tool === 'hatch') { hatchUp(w); return; }
    var f = factorOf(detail);
    if (draft.tool === 'text') {
      if (draft.step === 0) {
        draft.tip = snapAt(w).p;
        draft.step = 1;
        draft.cur = null;
        showHint('Tap where the text starts, or drag to set its width.');
        redraw();
        return;
      }
      var start = draft.start || w;
      var dx = w[0] - start[0];
      var dragged = Math.abs(dx) * view.z > 12;
      var width = dragged ? Math.abs(dx) : 2 * f;
      var note = {
        id: uid('n'), kind: 'note', text: '', c: pen.color,
        at: [dragged && dx < 0 ? start[0] - width : start[0], start[1]],
        width: width, height: null, size: SK.PAPER.text, justify: 'auto',
        leaders: [{ id: uid('l'), tip: draft.tip, bends: [], arrow: 'filled' }]
      };
      endDraft();
      ensureTake();
      openEditor(note, true);
      return;
    }
    if (draft.tool === 'dim') {
      var need = draft.mode === 'angular' ? 3 : 2;
      if (!draft.placing) {
        draft.pts.push(snapAt(w).p);
        if (draft.pts.length === need) draft.placing = true;
        draft.cur = null;
        draft.snapKind = null;
        showDimHint();
        redraw();
        return;
      }
      var dim = buildDim(w);
      endDraft();
      commitPut(dim, null);
      select(dim.id);
      return;
    }
    if (draft.tool === 'addLeader') {
      var it = byId(draft.id);
      endDraft();
      if (!it) return;
      var n = clone(it);
      n.leaders.push({ id: uid('l'), tip: snapAt(w).p, bends: [], arrow: (it.leaders[0] && it.leaders[0].arrow) || 'filled' });
      commitPut(n, it);
      select(n.id, n.leaders.length - 1);
    }
  }

  function buildDim(at) {
    var p = draft.pts;
    var d = { id: uid('m'), kind: 'dim', mode: draft.mode, at: at, text: null, size: SK.PAPER.text, end: 'tick', roundTo: null, c: pen.color };
    if (draft.mode === 'angular') { d.vertex = p[0]; d.p1 = p[1]; d.p2 = p[2]; }
    else { d.p1 = p[0]; d.p2 = p[1]; }
    if (draft.mode === 'ortho') d.orient = SK.orthoOrient(d.p1, d.p2, at);
    return d;
  }

  // ===================================================================
  // Selection and its chips
  // ===================================================================

  function select(id, leader) {
    sel = id ? { id: id, leader: leader == null ? null : leader } : null;
    if (settings.autoCollapse) setCollapsed(!!id);
    renderChips();
    redraw();
  }

  // The selected item, when it is an image or block (an underlay).
  function selectedUnderlay() {
    var it = sel && byId(sel.id);
    return !!it && SK.isUnderlay(it);
  }

  // Collapsed: both toolbars hide, for more room on a phone or tablet. The collapse button stays to bring them back.
  function setCollapsed(on) {
    document.body.classList.toggle('collapsed', on);
    $('collapseBtn').setAttribute('aria-pressed', String(on));
    if (typeof fitLeftRail === 'function') fitLeftRail();   // the bar may need its second column again once shown
  }
  $('collapseBtn').addEventListener('click', function () { setCollapsed(!document.body.classList.contains('collapsed')); });

  // The microphone starts muted. Unmuting asks for it (once the browser allows it, it is not asked again).
  function renderMic() {
    var m = SK.Mic.isMuted(), b = $('micBtn');
    b.textContent = m ? '🔇' : '🎤';
    b.setAttribute('aria-pressed', String(!m));
    b.setAttribute('aria-label', m ? 'Microphone muted' : 'Microphone on');
    b.title = m ? 'Microphone muted: recordings have no sound. Tap to unmute.' : 'Microphone on: recordings capture sound. Tap to mute.';
    b.classList.toggle('on', !m);
  }
  $('micBtn').addEventListener('click', function () {
    var unmuting = SK.Mic.isMuted();
    SK.Mic.setMuted(!unmuting).then(function (live) {
      renderMic();
      if (unmuting && !live) toast('The microphone is not available or was refused. Recordings stay silent.');
    });
  });
  renderMic();

  function deleteSelected() {
    if (!sel) return;
    var id = sel.id;
    sel = null;
    commitDel(id);
  }

  // A copy of an element, moved by (dx, dy) in drawing units. Covers every place an element keeps a position.
  function offsetCopy(it, dx, dy) {
    var c = clone(it);
    function shift(p) { return [p[0] + dx, p[1] + dy].concat(p.slice(2)); }
    if (c.pts) c.pts = c.pts.map(shift);
    ['at', 'p1', 'p2', 'vertex'].forEach(function (k) { if (c[k]) c[k] = shift(c[k]); });
    if (c.leaders) c.leaders.forEach(function (ld) { if (ld.tip) ld.tip = shift(ld.tip); });
    return c;
  }

  // Duplicate puts a copy a little down and to the right, so it can be seen and moved. It is selected at once.
  function duplicateSelected() {
    var it = sel && byId(sel.id);
    if (!it) return;
    var d = SK.PAPER.text * factorOf(detail) * 2;
    var copy = offsetCopy(it, d, d);
    copy.id = uid(it.id.charAt(0));
    commitPut(copy, null);
    select(copy.id);
    toast('Duplicated. Drag the copy where you need it.');
  }

  // Replace the selected item with a changed copy.
  function edit(fn) {
    var it = byId(sel.id);
    if (!it) return;
    var n = clone(it);
    fn(n);
    commitPut(n, it);
  }

  function chipSelect(label, options, value, onChange) {
    var s = el('select', { 'aria-label': label, on: { change: function (e) { onChange(e.target.value); } } });
    options.forEach(function (o) { s.appendChild(el('option', { value: o.v, text: o.l, selected: String(o.v) === String(value) })); });
    return el('label', { class: 'chip sel' }, [label + ' ', s]);
  }

  // Draw order for a hatch: where it sits among the linework. Underlays always paint first, so they are not offered here.
  // A button is off when its move would change nothing.
  function drawOrderChips(it) {
    return [['front', 'Bring to front'], ['forward', 'Move forward'], ['backward', 'Move back'], ['back', 'Send to back']].map(function (o) {
      var moved = SK.drawOrderMove(detail.items, it.id, o[0]);
      return el('button', { class: 'chip', text: o[1], disabled: !moved, on: { click: function () { commitReplace(SK.drawOrderMove(detail.items, it.id, o[0])); } } });
    });
  }

  function renderChips() {
    var bar = $('chips');
    bar.innerHTML = '';
    var it = sel && byId(sel.id);
    if (editing) {
      bar.appendChild(el('button', { class: 'chip on', text: 'Done', on: { mousedown: function (e) { e.preventDefault(); }, click: function () { closeEditor(true); } } }));
      bar.hidden = false;
      return;
    }
    if (!it) { bar.hidden = true; return; }
    var sizes = [{ v: 3 / 32, l: '3/32"' }, { v: 1 / 8, l: '1/8"' }, { v: 3 / 16, l: '3/16"' }, { v: 1 / 4, l: '1/4"' }];
    var chips = [];
    if (it.kind === 'note') {
      var li = sel.leader != null && it.leaders[sel.leader] ? sel.leader : null;
      var arrowNow = it.leaders.length ? it.leaders[li == null ? 0 : li].arrow : 'filled';
      chips.push(
        el('button', { class: 'chip', text: 'Edit text', on: { click: function () { openEditor(it, false); } } }),
        el('button', { class: 'chip', text: '+ Arrow', on: { click: function () {
          draft = { tool: 'addLeader', id: it.id };
          showHint('Tap where the new arrow points.');
        } } }),
        it.leaders.length ? el('button', { class: 'chip', text: '− Arrow', on: { click: function () {
          edit(function (n) { n.leaders.splice(li == null ? n.leaders.length - 1 : li, 1); });
          sel.leader = null;
          renderChips();
        } } }) : null,
        chipSelect(li == null ? 'Arrows' : 'Arrow', SK.ARROWS.map(function (a) { return { v: a.key, l: a.label }; }), arrowNow, function (v) {
          edit(function (n) { n.leaders.forEach(function (ld, i) { if (li == null || i === li) ld.arrow = v; }); });
        }),
        chipSelect('Size', sizes, it.size, function (v) { edit(function (n) { n.size = +v; }); }),
        it.height != null ? el('button', { class: 'chip', text: 'Auto height', on: { click: function () { edit(function (n) { n.height = null; }); } } }) : null
      );
    } else if (it.kind === 'hatch') {
      chips.push(
        chipSelect('Pattern', SK.HATCHES.filter(function (h) { return h.key !== 'none'; }).map(function (h) { return { v: h.key, l: h.label }; }), it.pattern, function (v) {
          edit(function (n) { n.pattern = v; });
        }),
        el('button', { class: 'chip', text: it.outline ? 'Hide outline' : 'Show outline', on: { click: function () {
          edit(function (n) { n.outline = !it.outline; });
        } } })
      );
    } else if (it.kind === 'image') {
      chips.push(
        el('button', { class: 'chip' + (it.noPrint ? ' on' : ''), text: it.noPrint ? 'No print' : 'Prints', title: 'No-print images show faintly and are left out of exports', on: { click: function () {
          edit(function (n) { n.noPrint = !it.noPrint; });
        } } }),
        el('button', { class: 'chip', text: 'Accept as detail…', on: { click: function () { acceptImage(it); } } })
      );
    } else if (it.kind === 'dim') {
      chips.push(
        el('button', { class: 'chip', text: 'Text…', on: { click: function () {
          var v = window.prompt('Dimension text. <> stands for the measured value (' + SK.dimText(Object.assign({}, it, { text: null }), ac()) + ').', it.text || '<>');
          if (v == null) return;
          edit(function (n) { n.text = v.trim() === '<>' || !v.trim() ? null : v; });
        } } }),
        it.text ? el('button', { class: 'chip', text: 'Use measured', on: { click: function () { edit(function (n) { n.text = null; }); } } }) : null,
        it.mode !== 'angular' ? chipSelect('Type', [{ v: 'ortho', l: 'Ortho' }, { v: 'aligned', l: 'Aligned' }], it.mode, function (v) {
          edit(function (n) { n.mode = v; if (v === 'ortho') n.orient = SK.orthoOrient(n.p1, n.p2, n.at); });
        }) : null,
        chipSelect('Ends', SK.ARROWS.filter(function (a) { return a.key !== 'none'; }).map(function (a) { return { v: a.key, l: a.label }; }), it.end, function (v) { edit(function (n) { n.end = v; }); }),
        chipSelect('Round', [{ v: '', l: 'Default' }].concat(ROUNDINGS.map(function (r) { return { v: r.v, l: r.l }; })), it.roundTo || '', function (v) { edit(function (n) { n.roundTo = v ? +v : null; }); }),
        chipSelect('Size', sizes, it.size, function (v) { edit(function (n) { n.size = +v; }); })
      );
    }
    if (it.kind === 'block' && sourceOf(it.sourceId)) {
      chips.push(
        el('button', { class: 'chip', text: 'Open source', on: { click: function () { openSource(it); } } }),
        el('button', { class: 'chip', text: 'Copy in', title: 'Turn the lines into plain copies here', on: { click: function () { copyInBlock(it); } } }),
        chipSelect('Size', [{ v: 0.5, l: '50%' }, { v: 1, l: '100%' }, { v: 1.5, l: '150%' }, { v: 2, l: '200%' }, { v: 3, l: '300%' }], SK.blockScale(it), function (v) {
          var box = SK.blockBounds(it, sourceOf, ac());
          edit(function (n) { scaleBlockTo(n, box, +v); });
        }),
        chipSelect('Opacity', [{ v: 0.2, l: '20%' }, { v: 0.4, l: '40%' }, { v: 0.6, l: '60%' }, { v: 0.8, l: '80%' }, { v: 1, l: '100%' }], it.opacity == null ? 0.4 : it.opacity, function (v) {
          edit(function (n) { n.opacity = +v; });
        }),
        chipSelect('Print', [{ v: 'no', l: 'Leave out' }, { v: 'yes', l: 'Include' }], it.print ? 'yes' : 'no', function (v) {
          edit(function (n) { n.print = v === 'yes'; });
        })
      );
    }
    // Every element can be duplicated. Underlays (images and blocks) have no order of their own, so they get no order buttons.
    chips.unshift(el('button', { class: 'chip', text: 'Duplicate', title: 'Make a copy, offset a little from this one', on: { click: duplicateSelected } }));
    if (!SK.isUnderlay(it)) chips.push.apply(chips, drawOrderChips(it));
    chips.push(el('button', { class: 'chip danger', text: 'Delete', on: { click: deleteSelected } }));
    chips.forEach(function (c) { if (c) bar.appendChild(c); });
    bar.hidden = false;
  }

  // ===================================================================
  // Note text editor (an overlay textarea; Scribble and dictation work in it on the iPad)
  // ===================================================================

  function openEditor(note, isNew) {
    var ta = $('editor');
    var f = factorOf(detail);
    var s = SK.toScreen(view, note.at);
    var px = Math.max(16, (note.size || SK.PAPER.text) * f * view.z);
    editing = { note: note, isNew: isNew };
    ta.value = note.text || '';
    ta.style.left = Math.max(8, Math.min(s[0], W() - 220)) + 'px';
    ta.style.top = Math.max(8, Math.min(s[1], H() - 120)) + 'px';
    ta.style.width = Math.max(200, Math.min(note.width * view.z, W() - 16)) + 'px';
    ta.style.fontSize = px + 'px';
    ta.classList.toggle('caps', settings.caps);
    ta.hidden = false;
    renderChips();
    setTimeout(function () { ta.focus(); }, 0);
  }

  function closeEditor(keep) {
    if (!editing) return;
    var e = editing;
    editing = null;
    var ta = $('editor');
    var text = ta.value.replace(/\s+$/, '');
    ta.hidden = true;
    ta.blur();
    if (keep && text.trim()) {
      if (e.isNew) {
        var n = clone(e.note);
        n.text = text;
        commitPut(n, null);
        select(n.id);
      } else if (text !== e.note.text) {
        var cur = byId(e.note.id);
        if (cur) { var m = clone(cur); m.text = text; commitPut(m, cur); }
      }
    }
    renderChips();
    redraw();
  }

  $('editor').addEventListener('blur', function () { setTimeout(function () { closeEditor(true); }, 0); });
  $('editor').addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); closeEditor(false); }
    else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); closeEditor(true); }
    e.stopPropagation();
  });

  // ===================================================================
  // Title block: tap the name for project info; drag across the scale to change it
  // ===================================================================

  $('titleName').addEventListener('click', function () { openPanel('project'); });

  (function () {
    var sdrag = null;
    var box = $('titleScale');
    box.addEventListener('pointerdown', function (e) {
      if (pb) return;
      box.setPointerCapture(e.pointerId);
      var i0 = SK.SCALES.indexOf(SK.scaleOf(detail.scale));
      sdrag = { x0: e.clientX, i0: i0, i: i0, moved: false, before: detail.scale };
    });
    box.addEventListener('pointermove', function (e) {
      if (!sdrag) return;
      var dx = e.clientX - sdrag.x0;
      if (Math.abs(dx) > TAP_PX) sdrag.moved = true;
      var i = Math.max(0, Math.min(SK.SCALES.length - 1, sdrag.i0 + Math.round(dx / 40)));
      if (i !== sdrag.i) {
        sdrag.i = i;
        detail.scale = SK.SCALES[i].key;
        $('scaleBig').textContent = SK.SCALES[i].label;
        $('scaleBig').hidden = false;
        redraw();
      }
    });
    function up() {
      if (!sdrag) return;
      var d = sdrag;
      sdrag = null;
      $('scaleBig').hidden = true;
      if (!d.moved) { openPanel('project'); return; }
      if (detail.scale !== d.before) {
        ops.push({ type: 'meta', key: 'scale', before: d.before });
        redos = [];
        changed();
      }
    }
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up);
  })();

  function setScale(key) {
    if (key === detail.scale) return;
    ops.push({ type: 'meta', key: 'scale', before: detail.scale });
    redos = [];
    detail.scale = key;
    changed();
  }

  // ===================================================================
  // Panels: project info, library, settings, log
  // ===================================================================

  function closePanel() {
    if (panelKind === 'log') $('log').hidden = true;
    else $('panel').hidden = true;
    panelKind = null;
    document.querySelectorAll('.rail [data-act], #lrail [data-act]').forEach(function (b) {
      if (b.getAttribute('data-act') !== tool) b.classList.remove('on');
    });
  }

  function openPanel(kind) {
    if (panelKind === kind) { closePanel(); return; }
    if (panelKind) closePanel();
    if (editing) closeEditor(true);
    panelKind = kind;
    var btn = document.querySelector('.rail [data-act="' + kind + '"]');
    if (btn) btn.classList.add('on');
    if (kind === 'log') { $('log').hidden = false; renderLog(); return; }
    $('panelTitle').textContent = { project: 'Project info', settings: 'Settings' }[kind];
    var body = $('panelBody');
    body.innerHTML = '';
    $('panel').hidden = false;
    if (kind === 'project') renderProject(body);
    else renderSettings(body);
  }

  function section(title, kids) {
    return el('section', {}, [el('h3', { text: title })].concat(kids));
  }

  // Images: placed on the no-print layer, faint on screen and left out of exports. Scaled down to keep the detail light.
  var IMAGE_MAX_PX = 1600;

  function addImage(file) {
    var url = URL.createObjectURL(file);
    var im = new Image();
    im.onload = function () {
      URL.revokeObjectURL(url);
      var k = Math.min(1, IMAGE_MAX_PX / Math.max(im.naturalWidth, im.naturalHeight));
      var cv = document.createElement('canvas');
      cv.width = Math.round(im.naturalWidth * k);
      cv.height = Math.round(im.naturalHeight * k);
      var c = cv.getContext('2d');
      c.fillStyle = '#fff';
      c.fillRect(0, 0, cv.width, cv.height);
      c.drawImage(im, 0, 0, cv.width, cv.height);
      // Half the screen wide, centred in the view.
      var w = Math.min(cv.width, W() * 0.5) / view.z, h = w * cv.height / cv.width;
      var mid = SK.toWorld(view, [W() / 2, H() / 2]);
      var item = {
        id: uid('i'), kind: 'image', src: cv.toDataURL('image/jpeg', 0.85), name: file.name.replace(/\.[^.]+$/, ''),
        at: [mid[0] - w / 2, mid[1] - h / 2], w: w, h: h, noPrint: true
      };
      commitPut(item, null);
      select(item.id);
      toast('Image added on the no-print layer. Draw over it freely. Use the arrow tool to move it or see its options.');
    };
    im.onerror = function () { URL.revokeObjectURL(url); toast('That file could not be read as an image.'); };
    im.src = url;
  }

  // Keep an image as its own library detail: printable, named, at the top-left of a new sheet.
  function acceptImage(it) {
    var title = window.prompt('Title for the new detail', it.name || 'Image detail');
    if (title == null || !title.trim()) return;
    var d = newDetail(title.trim());
    d.scale = detail.scale;
    d.tags = (detail.tags || []).slice();
    d.items = [Object.assign(clone(it), { id: uid('i'), at: [0, 0], noPrint: false })];
    saveDetail(d, [], null).then(function () {
      toast('Saved "' + d.name + '" to the library.');
    }).catch(function (e) { fail(e, 'Could not save: '); });
  }

  // A new detail drawn from a JSON spec (see sketch/author.js). Opens it, and returns the detail.
  function drawFromSpec(spec) {
    var text = typeof spec === 'string' ? spec : JSON.stringify(spec);
    var parsed = JSON.parse(text);
    var made = SK.authorDetail(parsed);
    var d = newDetail(made.name);
    d.scale = made.scale;
    d.tags = made.tags;
    d.items = made.items;
    return saveDetail(d, [], null).then(function () {
      closePanel();
      return openDetail(d);
    }).then(function () { return d; });
  }

  // Paste a drawing as JSON and make it a new detail. Errors say which item is wrong.
  function drawBox() {
    var box = el('textarea', { class: 'field json-box', rows: '6', placeholder: '{ "name": "...", "items": [ ... ] }', 'aria-label': 'Drawing as JSON' });
    var err = el('p', { class: 'muted', text: 'Paste a drawing description. Its positions are real inches, y down.' });
    return el('div', {}, [box, err, el('div', { class: 'row' }, [
      el('button', { class: 'btn', text: 'Create detail', on: { click: function () {
        if (!box.value.trim()) { err.textContent = 'Paste a JSON drawing first.'; return; }
        try {
          drawFromSpec(box.value).then(function (d) { toast('Drawn: ' + d.name + '.'); });
        } catch (e) {
          err.textContent = e.message;
        }
      } } })
    ])]);
  }

  // Keep a JSON file on this computer in step with the drawing. Choose it once; it is rewritten as you draw.
  function liveBox() {
    var id = detail.id;
    if (!SK.LiveFile.supported()) {
      return el('p', { class: 'muted', text: 'A live file needs Chrome or Edge on a computer. The detail and its JSON parallel still save in this browser.' });
    }
    var note = el('p', { class: 'muted' });
    var row = el('div', { class: 'row' });
    var draw = function () {
      row.innerHTML = '';
      if (SK.LiveFile.linked(id)) {
        note.textContent = 'Keeping ' + SK.LiveFile.name(id) + ' up to date as you draw.';
        row.appendChild(el('button', { class: 'btn', text: 'Stop', on: { click: function () { SK.LiveFile.stop(id); draw(); } } }));
      } else if (SK.LiveFile.waiting(id)) {
        note.textContent = SK.LiveFile.name(id) + ' is saved from an earlier visit. Resume to keep it up to date.';
        row.appendChild(el('button', { class: 'btn', text: 'Resume', on: { click: function () {
          SK.LiveFile.resume(id).then(function (ok) { if (ok) { writeLive(id); draw(); } else toast('Permission to write the file was not given.'); });
        } } }));
      } else {
        note.textContent = 'No file chosen. Choose one, and it will hold this detail as JSON as you draw.';
        row.appendChild(el('button', { class: 'btn', text: 'Choose JSON file…', on: { click: function () {
          SK.LiveFile.choose(id, slug(detail.name) + '.live.json').then(function () { writeLive(id); draw(); }).catch(function (e) {
            if (e && e.name !== 'AbortError') toast('Could not choose the file: ' + e.message);
          });
        } } }));
      }
    };
    draw();
    return el('div', {}, [note, row]);
  }

  function renderProject(body) {
    var name = el('input', { type: 'text', value: detail.name, 'aria-label': 'Detail name', class: 'field', on: { input: function (e) {
      detail.name = e.target.value;
      detail.modified = Date.now();
      saveSoon();
      updateTitle();
    } } });
    var scale = el('select', { class: 'field', 'aria-label': 'Scale', on: { change: function (e) { setScale(e.target.value); } } });
    SK.SCALES.forEach(function (s) { scale.appendChild(el('option', { value: s.key, text: s.label, selected: s.key === detail.scale })); });

    var tagWrap = el('div', { class: 'tags' });
    function drawTags() {
      tagWrap.innerHTML = '';
      var all = FIXED_TAGS.concat(customTags.filter(function (t) { return FIXED_TAGS.indexOf(t) < 0; }));
      detail.tags.forEach(function (t) { if (all.indexOf(t) < 0) all.push(t); });
      all.forEach(function (t) {
        var on = detail.tags.indexOf(t) >= 0;
        tagWrap.appendChild(el('button', { class: 'chip' + (on ? ' on' : ''), text: t, 'aria-pressed': String(on), on: { click: function () {
          if (on) detail.tags = detail.tags.filter(function (x) { return x !== t; });
          else detail.tags = detail.tags.concat([t]);
          detail.modified = Date.now();
          saveSoon();
          drawTags();
        } } }));
      });
      var add = el('input', { type: 'text', placeholder: '+ custom tag', class: 'tag-input', 'aria-label': 'Add a custom tag', on: { keydown: function (e) {
        if (e.key !== 'Enter') return;
        var t = e.target.value.trim().toLowerCase();
        if (!t) return;
        if (customTags.indexOf(t) < 0 && FIXED_TAGS.indexOf(t) < 0) {
          customTags.push(t);
          SK.DB.put('kv', customTags, 'customTags').catch(function () {});
        }
        if (detail.tags.indexOf(t) < 0) detail.tags = detail.tags.concat([t]);
        saveSoon();
        drawTags();
      } } });
      tagWrap.appendChild(add);
    }
    drawTags();

    var branch = null;
    if (detail.parentId) {
      branch = section('Branch', [
        el('p', { class: 'muted', text: 'This detail is a branch. Merging copies its lines, notes and dimensions into the detail it came from.' }),
        el('div', { class: 'row' }, [
          el('button', { class: 'btn', text: 'Merge into parent', on: { click: mergeIntoParent } }),
          el('button', { class: 'btn', text: 'Open parent', on: { click: function () {
            SK.DB.get('details', detail.parentId).then(function (p) { if (p) { closePanel(); openDetail(p); } else toast('The parent detail was deleted.'); });
          } } })
        ])
      ]);
    }

    [
      section('Detail name', [name]),
      section('Scale', [scale, el('p', { class: 'muted', text: 'The drawing stays the same size. Notes and dimension text are sized for the scale.' })]),
      section('Tags', [tagWrap]),
      section('Metadata', [el('div', { class: 'row' }, [
        el('button', { class: 'btn', text: 'Tag elements from recordings', on: { click: tagElements } }),
        el('button', { class: 'btn', text: 'Upload to cloud', on: { click: uploadToCloud } })
      ]), el('p', { class: 'muted', text: metadataPreview() })]),
      section('Blocks', blocksSection()),
      branch,
      section('Draw from JSON', [drawBox()]),
      section('JSON file, kept as you draw', [liveBox()]),
      section('File', [el('div', { class: 'row' }, [
        el('button', { class: 'btn', text: 'Save', on: { click: function () { saveNow().then(function () { toast('Saved.'); }).catch(fail); } } }),
        el('button', { class: 'btn', text: 'Save as…', on: { click: saveAs } }),
        el('button', { class: 'btn', text: 'New detail', on: { click: function () {
          var d = newDetail();
          SK.DB.put('details', d).then(function () { closePanel(); openDetail(d); });
        } } })
      ])]),
      section('Export', [el('div', { class: 'row' }, [
        el('button', { class: 'btn', text: 'JPEG', on: { click: exportJpeg } }),
        el('button', { class: 'btn', text: 'PNG (no background)', on: { click: exportPng } }),
        el('button', { class: 'btn', text: 'Scene series', on: { click: exportSeries } }),
        el('button', { class: 'btn', text: 'Data (JSON)', on: { click: exportData } }),
        el('button', { class: 'btn', text: 'Parallel JSON', on: { click: exportParallel } })
      ]), el('p', { class: 'muted', text: 'Each JPEG carries its metadata inside the file, and a .metadata.json sits beside it. Data (JSON) holds everything, for rebuilding the library later.' })]),
      section('Delete', [el('button', { class: 'btn danger', text: 'Delete this detail', on: { click: deleteDetail } })])
    ].forEach(function (s) { if (s) body.appendChild(s); });
  }

  // ---- Ratings: 0 to 5 stars. A new detail starts at 1. Tap a star to set it; tap the top star again for 0. ----
  function ratingOf(d) { return d.rating == null ? 1 : d.rating; }
  function starsText(n) { var out = ''; for (var i = 1; i <= 5; i++) out += i <= n ? '★' : '☆'; return out; }

  // Sets the rating on the cloud copy (when there is one) and on the local copy. The open detail is saved through saveNow.
  function setRating(d, n, fromCloud) {
    function local() {
      return SK.DB.get('details', d.id).then(function (mine) {
        if (detail && detail.id === d.id) { detail.rating = n; return saveNow(); }
        if (!mine) return;
        mine.rating = n;
        return SK.DB.put('details', mine).then(function () { cacheDetail(mine); });
      });
    }
    var job = fromCloud && d.cloud ? SK.Cloud.setRating(d.cloud.id, n).then(local) : local();
    return job.then(function () { d.rating = n; lib.cloudRows = null; renderLibrary(); })
      .catch(function (e) { fail(e, 'Could not set the rating: '); });
  }

  // Five stars in the info popup. Tapping a star sets the rating; tapping the top star again clears it to 0.
  function ratingRow(d, fromCloud) {
    var row = el('div', { class: 'stars', role: 'group', 'aria-label': 'Rating' });
    function draw() {
      var n = ratingOf(d);
      row.innerHTML = '';
      for (var i = 1; i <= 5; i++) {
        (function (i) {
          var label = i + (i === 1 ? ' star' : ' stars');
          row.appendChild(el('button', { class: 'star' + (i <= n ? ' on' : ''), text: i <= n ? '★' : '☆', title: label, 'aria-label': label,
            'aria-pressed': String(i <= n), on: { click: function () {
              setRating(d, i === n ? 0 : i, fromCloud).then(draw);
            } } }));
        })(i);
      }
      row.appendChild(el('span', { class: 'muted', text: n + (n === 1 ? ' star' : ' stars') }));
    }
    draw();
    return row;
  }

  // ---- Header menus: the sort (⇅) and the + (tags and card background) menus open one at a time ----
  function closeMenus() {
    ['libSortMenu', 'libMore'].forEach(function (id) { $(id).hidden = true; });
    ['libSortBtn', 'libMoreBtn'].forEach(function (id) { $(id).setAttribute('aria-expanded', 'false'); });
  }
  function toggleMenu(btnId, menuId) {
    var open = $(menuId).hidden;
    closeMenus();
    $(menuId).hidden = !open;
    $(btnId).setAttribute('aria-expanded', String(open));
  }

  // ---- Edit tags: every tag as a panel, with thumbnails of its details. Tags sort the files; a change never deletes a detail.
  // Element tags (from speech and shape) are a separate list. A change is written to the local copy and to the cloud copy
  // when both exist. Undo reverses the changes made since the page was opened.
  var tagEdit = { local: [], cloud: [], undo: [], sel: null, replacing: false, from: null, pick: null };

  function tagSource() { return lib.view === 'cloud' ? tagEdit.cloud : tagEdit.local; }
  function inTagSource(id) { return tagSource().some(function (d) { return d.id === id; }); }
  function elementTagsOf(d) {
    var out = [];
    (d.items || []).forEach(function (it) {
      if (it.meta) (it.meta.tags || []).forEach(function (t) { if (out.indexOf(t) < 0) out.push(t); });
    });
    return out;
  }

  function loadTagSources() {
    var locals = SK.DB.all('details').then(function (l) { return l.filter(function (d) { return !d.deletedAt; }); });
    var clouds = !SK.Cloud.ready() ? Promise.resolve([]) : SK.Cloud.session().then(function (s) {
      return s ? SK.Cloud.details().then(function (rows) { return rows.map(fromCloudRow); }) : [];
    }).catch(function () { return []; });
    return Promise.all([locals, clouds]).then(function (r) { tagEdit.local = r[0]; tagEdit.cloud = r[1]; });
  }

  function openTags() {
    closeMenus();
    $('libPage').hidden = true;
    tagEdit.undo = [];
    tagEdit.sel = null; tagEdit.replacing = false; tagEdit.from = null; tagEdit.pick = null;
    $('tagsPage').hidden = false;
    loadTagSources().then(renderTagsPage).catch(function (e) { fail(e, 'Could not read the tags: '); });
  }
  function closeTags() {
    $('tagsPage').hidden = true;
    tagEdit.undo = [];
    lib.cloudRows = null;
    $('libPage').hidden = false;
    renderLibrary();
  }

  function renderTagsPage() {
    var src = tagSource();
    $('tagsSource').textContent = (lib.view === 'cloud' ? 'Cloud' : 'This browser') + ' · ' + src.length + (src.length === 1 ? ' detail' : ' details');
    var last = tagEdit.undo[tagEdit.undo.length - 1];
    $('tagsUndo').disabled = !last;
    $('tagsUndo').textContent = last ? 'Undo: ' + last.label : 'Undo';

    var counts = {};
    src.forEach(function (d) { (d.tags || []).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
    var list = $('tagsList');
    list.innerHTML = '';
    list.appendChild(el('h3', { text: 'Tags' }));
    var tags = Object.keys(counts).sort();
    if (!tags.length) list.appendChild(el('p', { class: 'muted', text: 'No tags yet.' }));
    tags.forEach(function (t) {
      var cls = 'chip tag-btn';
      if (tagEdit.replacing) cls += t === tagEdit.from ? ' tag-from' : ' tag-target';
      if (tagEdit.pick === t) cls += ' tag-to';
      if (!tagEdit.replacing && tagEdit.sel === t) cls += ' on';
      list.appendChild(el('button', { class: cls, text: t + ' · ' + counts[t], on: { click: function () { onTagClick(t); } } }));
    });

    var ec = {};
    src.forEach(function (d) { elementTagsOf(d).forEach(function (t) { ec[t] = (ec[t] || 0) + 1; }); });
    list.appendChild(el('h3', { text: 'Element tags · not tags' }));
    list.appendChild(el('p', { class: 'muted small', text: 'Words and shapes the drawing picked up. Remove one to say you do not care about it, so the AI leaves it out.' }));
    var keys = Object.keys(ec).sort();
    if (!keys.length) list.appendChild(el('p', { class: 'muted small', text: 'None.' }));
    keys.forEach(function (t) {
      list.appendChild(el('div', { class: 'tag-el' }, [
        el('span', { text: t + ' · ' + ec[t] }),
        el('button', { class: 'btn small', text: 'Remove', on: { click: function () { changeTags('Remove element tag "' + t + '"', removeElementTag(t)); } } })
      ]));
    });
    renderTagPanel();
  }

  function onTagClick(t) {
    if (tagEdit.replacing) {
      if (t === tagEdit.from) { tagEdit.replacing = false; tagEdit.from = null; tagEdit.pick = null; renderTagsPage(); return; }
      tagEdit.pick = t;
      renderTagsPage();
      confirmReplace(tagEdit.from, t);
      return;
    }
    tagEdit.sel = tagEdit.sel === t ? null : t;
    renderTagsPage();
  }

  function renderTagPanel() {
    var panel = $('tagsPanel');
    panel.innerHTML = '';
    if (tagEdit.replacing) {
      panel.appendChild(el('p', { text: 'Replace "' + tagEdit.from + '" with…' }));
      panel.appendChild(el('p', { class: 'muted', text: 'Tap the tag to put in its place. Tap "' + tagEdit.from + '" again to cancel. A detail that has both keeps one.' }));
      return;
    }
    var t = tagEdit.sel;
    if (!t) { panel.appendChild(el('p', { class: 'muted', text: 'Tap a tag to see its details here.' })); return; }
    var items = tagSource().filter(function (d) { return (d.tags || []).indexOf(t) >= 0; });
    panel.appendChild(el('div', { class: 'row' }, [
      el('b', { text: t }),
      el('span', { class: 'muted', text: items.length + (items.length === 1 ? ' detail' : ' details') })
    ]));
    panel.appendChild(el('div', { class: 'row' }, [
      el('button', { class: 'btn', text: 'Replace tag…', on: { click: function () { tagEdit.replacing = true; tagEdit.from = t; tagEdit.pick = null; renderTagsPage(); } } }),
      el('button', { class: 'btn danger', text: 'Delete tag', on: { click: function () { confirmDeleteTag(t, items.length); } } })
    ]));
    panel.appendChild(el('div', { class: 'tag-thumbs' }, items.map(tagThumb)));
  }

  function tagThumb(d) {
    var a = acFor(d), col = libColors();
    var pic = cardPicture(d.items, cardBounds(d.items, a), a, col);
    pic.className = 'tag-thumb-pic';
    return el('figure', { class: 'tag-thumb' }, [pic, el('figcaption', { text: d.name })]);
  }

  // A confirm box over the page. Cancel is the safe choice, so it has focus.
  function popup(title, body, okText, onOk, onCancel) {
    var back = null;
    function close() { if (back) back.remove(); }
    var card = el('div', { class: 'pop-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
      el('b', { text: title }),
      el('p', { class: 'muted', text: body }),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn danger', text: okText, on: { click: function () { close(); onOk(); } } }),
        el('button', { class: 'btn', text: 'Cancel', on: { click: function () { close(); if (onCancel) onCancel(); } } })
      ])
    ]);
    back = el('div', { class: 'pop-back' }, [card]);
    document.body.appendChild(back);
    card.querySelector('.row .btn:last-child').focus();
  }

  function confirmDeleteTag(t, n) {
    popup('Delete tag "' + t + '"?',
      'It is taken off ' + n + (n === 1 ? ' detail' : ' details') + '. The details themselves stay. Undo lasts until this page closes.',
      'Delete tag', function () { tagEdit.sel = null; changeTags('Delete tag "' + t + '"', deleteTag(t)); });
  }
  function confirmReplace(a, b) {
    popup('Replace tag "' + a + '" with "' + b + '"?',
      'Every detail with "' + a + '" gets "' + b + '" instead. A detail that has both keeps one. Undo lasts until this page closes.',
      'Replace', function () {
        tagEdit.replacing = false; tagEdit.from = null; tagEdit.pick = null; tagEdit.sel = null;   // back to the first panel
        changeTags('Replace "' + a + '" with "' + b + '"', replaceTag(a, b));
      },
      function () { tagEdit.pick = null; renderTagsPage(); });
  }

  // The three changes. Each returns the new { tags, items } for one copy of a detail, or null when it is unchanged.
  function deleteTag(t) {
    return function (rec) {
      var tags = rec.tags || [];
      if (tags.indexOf(t) < 0) return null;
      return { tags: tags.filter(function (x) { return x !== t; }), items: rec.items || [] };
    };
  }
  function replaceTag(a, b) {
    return function (rec) {
      var tags = rec.tags || [];
      if (tags.indexOf(a) < 0) return null;
      var out = [];
      tags.forEach(function (x) { var y = x === a ? b : x; if (out.indexOf(y) < 0) out.push(y); });
      return { tags: out, items: rec.items || [] };
    };
  }
  function removeElementTag(t) {
    return function (rec) {
      var hit = false;
      var items = clone(rec.items || []).map(function (it) {
        if (it.meta && (it.meta.tags || []).indexOf(t) >= 0) {
          hit = true;
          it.meta.tags = it.meta.tags.filter(function (x) { return x !== t; });
        }
        return it;
      });
      return hit ? { tags: (rec.tags || []).slice(), items: items } : null;
    };
  }

  // Applies a change to every copy of the details on this page, and keeps it for undo.
  function changeTags(label, transform) {
    var entries = [];
    tagEdit.local.concat(tagEdit.cloud).forEach(function (rec) {
      if (!inTagSource(rec.id)) return;
      var next = transform(rec);
      if (!next) return;
      entries.push({
        store: rec.cloud ? 'cloud' : 'local', id: rec.id, cloudId: rec.cloud ? rec.cloud.id : null,
        before: { tags: (rec.tags || []).slice(), items: clone(rec.items || []) }, after: next
      });
    });
    if (!entries.length) { toast('Nothing to change.'); return; }
    writeTagEntries(entries, 'after').then(function () {
      tagEdit.undo.push({ label: label, entries: entries });
      lib.cloudRows = null;
      refreshTagSources().then(renderTagsPage);
      toast(label + ': ' + entries.length + (entries.length === 1 ? ' copy' : ' copies') + ' changed.');
    }).catch(function (e) { fail(e, 'Could not change the tags: '); });
  }

  function undoTagEdit() {
    var last = tagEdit.undo[tagEdit.undo.length - 1];
    if (!last) return;
    writeTagEntries(last.entries, 'before').then(function () {
      tagEdit.undo.pop();
      lib.cloudRows = null;
      refreshTagSources().then(renderTagsPage);
      toast('Undid: ' + last.label + '.');
    }).catch(function (e) { fail(e, 'Could not undo: '); });
  }

  function refreshTagSources() { return loadTagSources(); }

  // Writes one set of entries, the 'before' or the 'after' values, one copy at a time.
  function writeTagEntries(entries, key) {
    return entries.reduce(function (p, e) {
      return p.then(function () {
        var v = e[key];
        if (e.store === 'cloud') return SK.Cloud.setTagsItems(e.cloudId, v.tags, clone(v.items));
        if (detail && detail.id === e.id) {   // the open detail is saved through the editor's own path
          detail.tags = v.tags.slice();
          detail.items = clone(v.items);
          detail.modified = Date.now();
          return saveNow();
        }
        return SK.DB.get('details', e.id).then(function (mine) {
          if (!mine) return;
          mine.tags = v.tags.slice();
          mine.items = clone(v.items);
          mine.modified = Date.now();
          return SK.DB.put('details', mine).then(function () { cacheDetail(mine); });
        });
      });
    }, Promise.resolve());
  }

  // Library page: every detail with its tags and metadata. Sort, filter by tag, and hold a card to flip through its scenes.

  var lib = { sessions: {}, frames: {}, view: 'local', query: '', filters: [] };   // filters: tags picked; a detail must have all of them

  function sceneCountOf(d) { return SK.scenesOf(lib.sessions[d.id] || []).length; }

  // A detail's tags: the ones typed on it, plus the ones found in its tagged elements.
  // Element tags (from speech and shape) are not tags: they are listed on the Edit tags page.
  function detailTags(d) { return (d.tags || []).slice(); }

  function openLibrary() {
    closePanel();
    if (pb) exitReplay();
    lib.frames = {};
    lib.cloudRows = null;   // the cloud list is read once per visit; search and filters reuse it
    lib.filters = [];       // every visit starts on All, sorted by last edited
    $('libSort').value = 'recent';
    $('libPage').hidden = false;
    document.querySelector('.rail [data-act="library"]').classList.add('on');
    renderLibrary();
  }

  function closeLibrary() {
    $('libPage').hidden = true;
    document.querySelector('.rail [data-act="library"]').classList.remove('on');
  }

  function matchesQuery(d, q) {
    var words = SK.scenesOf(lib.sessions[d.id] || []).map(function (s) { return s.text; }).join(' ');
    return [d.name, d.scale, detailTags(d).join(' '), words].join(' ').toLowerCase().indexOf(q) >= 0;
  }

  function setLibraryTabs() {
    document.querySelectorAll('#libPage [data-view]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-view') === lib.view);
    });
    document.querySelectorAll('#libSortMenu [data-sort]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-sort') === $('libSort').value);
    });
    document.querySelectorAll('#libBg [data-bg]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-bg') === (settings.libBg || 'sheet'));
    });
  }

  function renderLibrary() {
    setLibraryTabs();
    if (lib.view === 'cloud') return renderCloud();
    if (lib.view === 'bin') return renderBin();
    Promise.all([SK.DB.all('details'), SK.DB.all('sessions')]).then(function (r) {
      lib.sessions = {};
      r[1].forEach(function (s) { (lib.sessions[s.detailId] = lib.sessions[s.detailId] || []).push(s); });
      setDetails(r[0]);
      showDetails(r[0].filter(function (d) { return !d.deletedAt; }), libCard, null, 'No details yet. Draw something, or tap New detail.');
    }).catch(function (e) { fail(e, 'Could not read the library: '); });
  }

  // Dates as the cards and the info panel show them.
  function dateOf(t) { return new Date(t).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  function editedLine(d) { return 'Edited ' + dateOf(d.modified) + (d.created ? ' · Created ' + dateOf(d.created) : ''); }

  // Both views list details the same way: one flat list, sorted, filtered by tags and search. lead goes on top.
  function showDetails(details, card, lead, empty) {
    var sort = $('libSort').value;
    details.sort(function (a, b) {
      if (sort === 'recent') return b.modified - a.modified || a.name.localeCompare(b.name);
      if (sort === 'created') return (b.created || 0) - (a.created || 0) || a.name.localeCompare(b.name);
      if (sort === 'rating') return ratingOf(b) - ratingOf(a) || a.name.localeCompare(b.name);
      if (sort === 'scenes') return sceneCountOf(b) - sceneCountOf(a) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });

    var tags = [];
    details.forEach(function (d) { detailTags(d).forEach(function (t) { if (tags.indexOf(t) < 0) tags.push(t); }); });
    tags.sort();
    var filters = $('libFilters');
    filters.innerHTML = '';
    filters.appendChild(el('button', { class: 'chip' + (!lib.filters.length ? ' on' : ''), text: 'All', on: { click: function () { lib.filters = []; renderLibrary(); } } }));
    tags.forEach(function (t) {
      var picked = lib.filters.indexOf(t) >= 0;
      filters.appendChild(el('button', { class: 'chip' + (picked ? ' on' : ''), text: t, 'aria-pressed': String(picked), on: { click: function () {
        lib.filters = picked ? lib.filters.filter(function (x) { return x !== t; }) : lib.filters.concat([t]);
        renderLibrary();
      } } }));
    });

    var q = (lib.query || '').trim().toLowerCase();
    var shown = details.filter(function (d) {
      var own = detailTags(d);
      return lib.filters.every(function (t) { return own.indexOf(t) >= 0; }) && (!q || matchesQuery(d, q));
    });
    var body = $('libBody');
    body.innerHTML = '';
    if (lead) body.appendChild(lead);
    if (!shown.length) { body.appendChild(el('p', { class: 'muted', text: q || lib.filters.length ? 'Nothing matches.' : empty })); return; }

    // Not grouped by tag: a tag splits the list, so the order by last edited would no longer read down the page.
    var grid = el('div', { class: 'lib-grid' });
    shown.forEach(function (d) { grid.appendChild(card(d)); });
    body.appendChild(grid);
  }

  // Library cards as drawn on the sheet, in colour on white, or black only on white.
  function libColors() {
    if (settings.libBg === 'white' || settings.libBg === 'mono') return { ink: '#111111', paper: '#ffffff', mono: settings.libBg === 'mono' };
    var c = colors();
    return { ink: c.ink, paper: c.paper, mono: false };
  }

  // A card shows what prints: underlays are left out, and the picture is framed on the printed part.
  function cardPicture(items, b, a, col) {
    return SK.picture(visible(SK.printable(items)), b, 220, 140, { ac: a, ink: col.ink, paper: col.paper, mono: col.mono, print: true });
  }
  function cardBounds(items, a) { return SK.itemsBounds(visible(SK.printable(items)), a) || SK.itemsBounds(visible(items), a); }

  // Tags take two lines on a card. Tapping them expands the list; the tap does not open the card.
  function tagsLine(tags) {
    return el('span', { class: 'tags-line clamp', text: tags.join(' · ') || 'no tags yet', on: { click: function (e) {
      e.stopPropagation();
      e.currentTarget.classList.toggle('open');
    } } });
  }

  function libCard(d) {
    var a = acFor(d);
    var col = libColors();
    var sess = lib.sessions[d.id] || [];
    var scenes = SK.scenesOf(sess);
    var recorded = sess.reduce(function (n, s) { return n + (s.duration || 0); }, 0);
    var tagged = d.items.filter(function (it) { return it.meta; }).length;
    var users = SK.usersOf(d.id, allDetails).length;
    var pic = cardPicture(d.items, cardBounds(d.items, a), a, col);
    SK.whenImages(visible(d.items)).then(function () {   // an image may load after the card is drawn
      var again = cardPicture(d.items, cardBounds(d.items, a), a, col);
      if (!pic.parentNode || pic.parentNode.classList.contains('flipping')) return;
      pic.getContext('2d').drawImage(again, 0, 0);
    });
    var last = scenes.length ? scenes[scenes.length - 1].text : '';
    var del = el('button', { class: 'lib-del', text: '×', title: 'Delete from this browser', 'aria-label': 'Delete ' + d.name, on: { click: function (e) {
      e.stopPropagation();
      removeDetail(d);
    } } });
    var card = el('article', { class: 'lib-card' + (d.id === detail.id ? ' on' : ''), role: 'button', tabindex: '0' }, [
      del,
      pic,
      el('span', { class: 'flip-label' }),
      el('b', { text: d.name }),
      el('span', { class: 'muted', text: SK.scaleOf(d.scale).label + (d.parentId ? ' · branch' : '') }),
      el('span', { class: 'stars-line', text: starsText(ratingOf(d)), title: ratingOf(d) + ' of 5 stars' }),
      el('span', { class: 'meta', text: scenes.length + (scenes.length === 1 ? ' scene' : ' scenes') + ' · ' +
        sess.length + (sess.length === 1 ? ' recording' : ' recordings') + ' · ' + SK.formatTime(recorded) + ' · ' +
        d.items.length + ' elements (' + tagged + ' tagged)' }),
      el('span', { class: 'meta', text: editedLine(d) }),
        users ? el('span', { class: 'meta', text: 'Used in ' + users + (users === 1 ? ' block' : ' blocks') }) : null,
      tagsLine(detailTags(d)),
      el('p', { class: 'said', text: last ? SK.firstWords(last, 10) : 'No words recorded yet.' })
    ]);
    // Hold a card to preview it: its scenes, or the drawing building up when there are no recordings.
    bindFlip(card, pic, d);
    // Tapping a card shows its summary. Editing is a separate button, so the detail is never opened by accident.
    card.addEventListener('click', function () {
      if (Date.now() < card._quietUntil) return;
      showDetailInfo(d);
    });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); card.click(); }
    });
    return card;
  }

  // The summary a library card opens: picture, tags and facts, then three actions. Nothing here opens the editor by itself.
  // A cloud detail becomes a local copy the first time it is duplicated or imported as a block, since both need it on this device.
  function localCopyOf(d) {
    return SK.DB.get('details', d.id).then(function (mine) {
      if (mine) return mine;
      var copy = { id: d.id, name: d.name, scale: d.scale, tags: d.tags || [], items: d.items || [], parentId: null, created: d.created, modified: d.modified };
      return saveDetail(copy, [], null).then(function () { return copy; });
    });
  }

  function showDetailInfo(d, fromCloud) {
    var a = acFor(d), col = libColors();
    var sess = lib.sessions[d.id] || [];
    var scenes = SK.scenesOf(sess);
    var recorded = sess.reduce(function (n, s) { return n + (s.duration || 0); }, 0);
    var users = SK.usersOf(d.id, allDetails).length;
    var pic = cardPicture(d.items, cardBounds(d.items, a), a, col);
    pic.className = 'info-pic';
    var facts = [
      scenes.length + (scenes.length === 1 ? ' scene' : ' scenes') + ' · ' + sess.length + (sess.length === 1 ? ' recording' : ' recordings') + ' · ' + SK.formatTime(recorded),
      d.items.length + ' elements · ' + SK.scaleOf(d.scale).label,
      'Last edited ' + dateOf(d.modified)
    ];
    if (d.created) facts.push('Created ' + dateOf(d.created));
    if (users) facts.push('Used in ' + users + (users === 1 ? ' block' : ' blocks'));
    if (isBlockDetail(d)) facts.push('A block: tick it in a detail\'s Blocks checklist to add it there.');
    var inHere = d.id === detail.id;
    var back = null;
    function close() { if (back) back.remove(); }
    // The × deletes, as on the card: from the cloud for a cloud detail, to the recycle bin for a local one.
    var del = el('button', { class: 'lib-del', text: '×', title: fromCloud ? 'Move to the cloud recycle bin' : 'Delete from this browser',
      'aria-label': 'Delete ' + d.name, on: { click: function () {
        close();
        if (fromCloud) deleteFromCloud(d); else removeDetail(d);
      } } });
    var card = el('div', { class: 'pop-card info-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': d.name }, [
      del,
      pic,
      el('b', { text: d.name }),
      el('p', { class: 'tags-line', text: detailTags(d).join(' · ') || 'no tags yet' }),
      ratingRow(d, fromCloud),
      el('ul', { class: 'info-facts' }, facts.map(function (f) { return el('li', { class: 'muted', text: f }); })),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn', text: 'Open', on: { click: function () {
          close();
          if (fromCloud) { openCloudDetail(d); return; }
          closeLibrary();
          openDetail(d);
        } } }),
        el('button', { class: 'btn', text: 'Insert as block', on: { click: function () {
          if (inHere) { toast('This is the open detail. Open another one to insert it as a block.'); return; }
          close();
          closeLibrary();
          (fromCloud ? localCopyOf(d) : Promise.resolve(d)).then(addBlock).catch(fail);
        } } }),
        el('button', { class: 'btn', text: 'Duplicate', on: { click: function () {
          close();
          (fromCloud ? localCopyOf(d) : Promise.resolve(d)).then(duplicateDetail).catch(fail);
        } } }),
        el('button', { class: 'btn', text: 'Rename', on: { click: function () {
          var name = window.prompt('Rename', d.name);
          if (name == null || !name.trim()) return;
          close();
          renameDetail(d, name.trim(), fromCloud);
        } } }),
        el('button', { class: 'btn', text: 'GIF', title: 'Download a GIF of this detail\'s recordings', on: { click: function () {
          downloadGif(d, fromCloud);   // the card stays open, so a second GIF can be made
        } } }),
        el('button', { class: 'btn', text: 'Close', on: { click: close } })
      ])
    ]);
    back = el('div', { class: 'pop-back', on: { click: function (e) { if (e.target === back) close(); } } }, [card]);
    document.body.appendChild(back);
    card.querySelector('.btn').focus();
  }

  // Rename a detail from the library. A cloud card renames the cloud copy, and the local copy too when this device has one.
  function renameDetail(d, name, fromCloud) {
    function done() {
      toast('Renamed to "' + name + '".');
      lib.cloudRows = null;
      renderLibrary();
    }
    function local() {
      if (detail && detail.id === d.id) {   // the open detail is edited in memory, so change it there and save it
        detail.name = name;
        detail.modified = Date.now();
        updateTitle();
        return saveNow();
      }
      return SK.DB.get('details', d.id).then(function (mine) {
        if (!mine) return;
        mine.name = name;
        mine.modified = Date.now();
        return SK.DB.put('details', mine).then(function () { cacheDetail(mine); });
      });
    }
    var job = fromCloud ? SK.Cloud.rename(d.cloud.id, name).then(local) : local();
    job.then(done).catch(function (e) { fail(e, 'Could not rename: '); });
  }

  // Cloud scenes: the scene JPEG of each uploaded recording, in recording order. A cloud card has no local sessions to replay.
  function cloudFrames(d) {
    var id = d.cloud.id;
    return Promise.all([SK.Cloud.recordingsOf(id), SK.Cloud.snapshotsOf(id)]).then(function (r) {
      var ordered = [];
      r[0].forEach(function (rec) {
        r[1].filter(function (s) { return s.recording_id === rec.id; }).forEach(function (s) { ordered.push(s); });
      });
      return Promise.all(ordered.map(function (s) {
        return SK.Cloud.signedUrl(s.image_path).then(loadPicture).then(function (img) {
          var c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          return { canvas: c };
        });
      }));
    });
  }

  function loadPicture(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = 'anonymous';   // so the canvas can be read back for the GIF
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('a scene picture did not load')); };
      img.src = url;
    });
  }

  // A GIF of a detail's recordings: one frame per scene, at the same pace as the hold-to-flip preview.
  // A local detail with no recordings gets its build-up frames instead. Local frames are drawn at twice size so the file
  // reads on a screen; cloud scene JPEGs are capped at 900 px wide, since they are full sheets.
  function downloadGif(d, fromCloud) {
    var GIF_FRAME_MS = 300;
    (fromCloud ? cloudFrames(d) : framesFor(d)).then(function (frames) {
      if (!frames.length) { toast('Nothing to animate yet. Record a scene, or draw a few lines.'); return; }
      toast('Making the GIF…');
      // Every frame is drawn at the last frame's size, since a GIF has one size and a drawing grows as it is built.
      var last = frames[frames.length - 1].canvas;
      var k = fromCloud ? Math.min(1, 900 / last.width) : 2;
      var W = Math.round(last.width * k), H = Math.round(last.height * k);
      var pics = frames.map(function (f) {
        var c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        var g = c.getContext('2d');
        g.imageSmoothingEnabled = false;
        g.drawImage(f.canvas, 0, 0, W, H);
        var px = g.getImageData(0, 0, c.width, c.height);
        return { width: c.width, height: c.height, data: px.data };
      });
      var bytes = SK.encodeGif(pics, GIF_FRAME_MS);
      download(new Blob([bytes], { type: 'image/gif' }), slug(d.name) + '.gif');
      toast('Saved "' + slug(d.name) + '.gif".');
    }).catch(function (e) { fail(e, 'Could not make the GIF: '); });
  }

  // A copy with the same lines, tags and scale. Its recordings stay with the original. Blocks in it still link to their sources.
  function duplicateDetail(d) {
    var c = newDetail(d.name + ' copy');
    c.scale = d.scale;
    c.tags = (d.tags || []).slice();
    c.items = clone(d.items);
    saveDetail(c, [], null).then(function () {
      toast('Duplicated as "' + c.name + '". The original is unchanged.');
      renderLibrary();
    }).catch(fail);
  }

  // Delete from the library. The detail goes to the recycle bin, where it can be restored until the bin is emptied.
  function removeDetail(d) {
    if (d.id === detail.id) { closeLibrary(); deleteDetail(); return; }
    confirmDelete(d, function () { moveToBin(d); });
  }

  // Asks before a detail goes to the bin. "Don't ask for 5 minutes" skips the question until the time is up.
  function confirmDelete(d, go) {
    if (Date.now() < recycleQuietUntil) { go(); return; }
    var back = null;
    function close() { if (back) back.remove(); }
    var card = el('div', { class: 'pop-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Move to the recycle bin' }, [
      el('b', { text: 'Move "' + d.name + '" to the recycle bin?' }),
      el('p', { class: 'muted', text: 'Its recordings go with it. You can restore it from Library → Recycle bin until you empty the bin.' }),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn danger', text: 'Move to bin', on: { click: function () { close(); go(); } } }),
        el('button', { class: 'btn', text: 'Don\'t ask for 5 minutes', on: { click: function () {
          recycleQuietUntil = Date.now() + 5 * 60 * 1000;
          close();
          go();
        } } }),
        el('button', { class: 'btn', text: 'Cancel', on: { click: close } })
      ])
    ]);
    back = el('div', { class: 'pop-back' }, [card]);
    document.body.appendChild(back);
    card.querySelector('.btn').focus();
  }

  function moveToBin(d) {
    d.deletedAt = Date.now();
    SK.DB.put('details', d).then(function () {
      cacheDetail(d);
      toast('Moved "' + d.name + '" to the recycle bin.');
      renderLibrary();
    }).catch(function (e) { fail(e, 'Could not delete: '); });
  }

  function restoreDetail(d) {
    d.deletedAt = null;
    SK.DB.put('details', d).then(function () {
      cacheDetail(d);
      toast('Restored "' + d.name + '".');
      renderBin();
    }).catch(function (e) { fail(e, 'Could not restore: '); });
  }

  // Deletes a detail and its recordings for good. Used by the recycle bin only.
  function purgeDetail(d) {
    return SK.DB.sessionsOf(d.id)
      .then(function (list) { return Promise.all(list.map(function (s) { return SK.DB.del('sessions', s.id); })); })
      .then(function () { return SK.DB.del('details', d.id); })
      .then(function () {
        allDetails = allDetails.filter(function (x) { return x.id !== d.id; });
        delete sources[d.id];
      });
  }

  function emptyBin(gone) {
    if (!window.confirm('Empty the recycle bin? ' + gone.length + (gone.length === 1 ? ' detail and its recordings' : ' details and their recordings') + ' will be deleted for good.')) return;
    gone.reduce(function (p, d) { return p.then(function () { return purgeDetail(d); }); }, Promise.resolve())
      .then(function () { toast('The recycle bin is empty.'); renderBin(); })
      .catch(function (e) { fail(e, 'Could not empty the bin: '); });
  }

  // The recycle bin: deleted details wait here. Nothing in it shows in the library.
  function renderBin() {
    $('libFilters').innerHTML = '';
    var body = $('libBody');
    SK.DB.all('details').then(function (list) {
      var gone = list.filter(function (d) { return d.deletedAt; }).sort(function (a, b) { return b.deletedAt - a.deletedAt; });
      body.innerHTML = '';
      body.appendChild(el('div', { class: 'row bin-head' }, [
        el('p', { class: 'muted', text: gone.length
          ? gone.length + (gone.length === 1 ? ' detail' : ' details') + ' in the bin. Restore them, or empty the bin to delete them for good.'
          : 'The bin is empty. Details you delete wait here until you empty the bin.' }),
        gone.length ? el('button', { class: 'btn danger', text: 'Empty recycle bin', on: { click: function () { emptyBin(gone); } } }) : null
      ]));
      gone.forEach(function (d) {
        body.appendChild(el('article', { class: 'bin-row' }, [
          el('b', { text: d.name }),
          el('span', { class: 'muted', text: 'Deleted ' + new Date(d.deletedAt).toLocaleString() + ' · ' + d.items.length + ' elements' }),
          el('div', { class: 'row' }, [
            el('button', { class: 'btn', text: 'Restore', on: { click: function () { restoreDetail(d); } } }),
            el('button', { class: 'btn danger', text: 'Delete for good', on: { click: function () {
              if (window.confirm('Delete "' + d.name + '" and its recordings for good? This cannot be undone.')) purgeDetail(d).then(renderBin).catch(function (e) { fail(e, 'Could not delete: '); });
            } } })
          ])
        ]));
      });
      renderCloudBin(body);
    }).catch(function (e) { fail(e, 'Could not read the bin: '); });
  }

  // ---------------- Cloud: sign in, review what was uploaded, see the table index ----------------

  function signInForm() {
    var email = el('input', { type: 'email', placeholder: 'you@example.com', 'aria-label': 'Email', class: 'field', autocomplete: 'username' });
    var password = el('input', { type: 'password', placeholder: 'Password', 'aria-label': 'Password', class: 'field', autocomplete: 'current-password' });
    var inPassword = function () { return email.value.trim(); };
    var signIn = el('button', { class: 'btn primary', text: 'Sign in', on: { click: function () {
      var v = inPassword();
      if (!v || !password.value) { toast('Enter your email and password.'); return; }
      SK.Cloud.signInWithPassword(v, password.value).then(function (r) {
        if (r.error) throw r.error;
        password.value = '';
        toast('Signed in.');
        renderCloud();
      }).catch(function (e) { fail(e, 'Could not sign in: '); });
    } } });
    var forgot = el('button', { class: 'btn small', text: 'Forgot password', on: { click: function () {
      var v = inPassword();
      if (!v) { toast('Enter your email first.'); return; }
      SK.Cloud.resetPassword(v).then(function (r) {
        if (r.error) throw r.error;
        toast('If that address has an account, a reset link is on its way.');
      }).catch(function (e) { fail(e, 'Could not send the reset link: '); });
    } } });
    var link = el('button', { class: 'btn small', text: 'Email me a sign-in link', on: { click: function () {
      var v = inPassword();
      if (!v) { toast('Enter your email first.'); return; }
      SK.Cloud.signIn(v).then(function (r) {
        if (r.error) throw r.error;
        toast('Check your email. Open the link on this device to sign in.');
      }).catch(function (e) { fail(e, 'Could not send the link: '); });
    } } });
    return section('Sign in', [
      el('p', { class: 'muted', text: 'Uploads need a sign-in. Only the owner account can read or write the cloud tables.' }),
      el('div', { class: 'row' }, [email, password, signIn]),
      el('div', { class: 'row' }, [forgot, link])
    ]);
  }

  // Cloud collections: each tag is a collection, the same as the library on this device.
  function renderCloud() {
    var body = $('libBody');
    body.innerHTML = '';
    $('libFilters').innerHTML = '';
    if (!SK.Cloud.ready()) {
      body.appendChild(el('p', { class: 'muted', text: 'The cloud library did not load. Check the connection. Drawings still save on this device.' }));
      return;
    }
    SK.Cloud.session().then(function (s) {
      if (!s) { body.appendChild(signInForm()); return; }
      var rows = lib.cloudRows ? Promise.resolve(lib.cloudRows) : SK.Cloud.details().then(function (l) { lib.cloudRows = l; return l; });
      return rows.then(function (list) {
        lib.sessions = {};
        var lead = el('div', { class: 'row' }, [
          el('span', { class: 'muted', text: 'Signed in. Tap a detail to open it on this device.' }),
          el('button', { class: 'btn small', text: 'Sign out', on: { click: function () { lib.cloudRows = null; SK.Cloud.signOut().then(renderCloud); } } })
        ]);
        showDetails(list.map(fromCloudRow), cloudCard, lead, 'Nothing uploaded yet. Open a detail, then Project info → Upload to cloud.');
      });
    }).catch(function (e) {
      fail(e, 'Could not reach the cloud: ');
      body.appendChild(el('p', { class: 'muted', text: 'Try again in a moment. Your drawings still save on this device.' }));
    });
  }

  // A cloud row as a detail, keyed by the id it has on the device it came from.
  function fromCloudRow(r) {
    return {
      id: r.local_id, name: r.name, scale: r.scale, tags: r.tags || [], items: r.items || [],
      parentId: null, created: Date.parse(r.created_at || r.updated_at), modified: Date.parse(r.updated_at), cloud: r,
      rating: r.metadata && r.metadata.rating != null ? r.metadata.rating : null
    };
  }

  // Moves a detail from the cloud library to the cloud recycle bin. Its files stay until it is deleted for good from the bin.
  // The copy on this device stays. "Don't ask for 5 minutes" is shared with the local bin.
  function deleteFromCloud(d) {
    function go() {
      SK.Cloud.softDelete(d.cloud.id).then(function () {
        toast('Moved "' + d.name + '" to the cloud recycle bin.');
        lib.cloudRows = null;
        renderLibrary();
      }).catch(function (e) { fail(e, 'Could not move to the bin: '); });
    }
    if (Date.now() < recycleQuietUntil) { go(); return; }
    var back = null;
    function close() { if (back) back.remove(); }
    var card = el('div', { class: 'pop-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Move to the cloud recycle bin' }, [
      el('b', { text: 'Move "' + d.name + '" to the cloud recycle bin?' }),
      el('p', { class: 'muted', text: 'Its recordings go with it. You can restore it from Library → Recycle bin until you empty the cloud bin. The copy in this browser stays.' }),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn danger', text: 'Move to bin', on: { click: function () { close(); go(); } } }),
        el('button', { class: 'btn', text: 'Don\'t ask for 5 minutes', on: { click: function () {
          recycleQuietUntil = Date.now() + 5 * 60 * 1000;
          close();
          go();
        } } }),
        el('button', { class: 'btn', text: 'Cancel', on: { click: close } })
      ])
    ]);
    back = el('div', { class: 'pop-back' }, [card]);
    document.body.appendChild(back);
    card.querySelector('.row .btn:last-child').focus();   // Cancel is the safe choice, so it has focus
  }

  // Deletes a detail from the cloud for good. Used by the cloud recycle bin only.
  function purgeCloud(r) {
    return SK.Cloud.purge(r).then(function () { lib.cloudRows = null; toast('Deleted "' + r.name + '" from the cloud.'); });
  }

  function emptyCloudBin(rows) {
    if (!window.confirm('Empty the cloud recycle bin? ' + rows.length + (rows.length === 1 ? ' detail and its recordings' : ' details and their recordings') + ' will be deleted from the cloud for good.')) return;
    rows.reduce(function (p, r) { return p.then(function () { return SK.Cloud.purge(r); }); }, Promise.resolve())
      .then(function () { lib.cloudRows = null; toast('The cloud recycle bin is empty.'); renderBin(); })
      .catch(function (e) { fail(e, 'Could not empty the cloud bin: '); });
  }

  // The cloud recycle bin, listed under the local bin when this browser is signed in to the cloud.
  function renderCloudBin(body) {
    if (!SK.Cloud.ready()) return;
    SK.Cloud.session().then(function (s) {
      if (!s) return;
      return SK.Cloud.trashed().then(function (rows) {
        body.appendChild(el('h3', { text: 'Cloud recycle bin · ' + rows.length }));
        if (!rows.length) { body.appendChild(el('p', { class: 'muted', text: 'The cloud bin is empty.' })); return; }
        body.appendChild(el('div', { class: 'row bin-head' }, [
          el('p', { class: 'muted', text: rows.length + (rows.length === 1 ? ' detail' : ' details') + ' in the cloud bin. Restore them, or delete them for good from the cloud.' }),
          el('button', { class: 'btn danger', text: 'Empty cloud bin', on: { click: function () { emptyCloudBin(rows); } } })
        ]));
        rows.forEach(function (r) {
          body.appendChild(el('article', { class: 'bin-row' }, [
            el('b', { text: r.name }),
            el('span', { class: 'muted', text: 'Deleted ' + dateOf(Date.parse(r.deleted_at)) + ' · ' + (r.items || []).length + ' elements' }),
            el('div', { class: 'row' }, [
              el('button', { class: 'btn', text: 'Restore', on: { click: function () {
                SK.Cloud.restore(r.id).then(function () {
                  toast('Restored "' + r.name + '" from the cloud bin.');
                  lib.cloudRows = null;
                  renderBin();
                }).catch(function (e) { fail(e, 'Could not restore: '); });
              } } }),
              el('button', { class: 'btn danger', text: 'Delete for good', on: { click: function () {
                if (window.confirm('Delete "' + r.name + '" from the cloud for good? Its recordings and scene pictures go too. This cannot be undone.')) purgeCloud(r).then(renderBin).catch(function (e) { fail(e, 'Could not delete: '); });
              } } })
            ])
          ]));
        });
      });
    }).catch(function (e) { fail(e, 'Could not read the cloud bin: '); });
  }

  // The same card as the local library; tapping it opens the detail here. Recordings has its own button.
  function cloudCard(d) {
    var a = acFor(d);
    var col = libColors();
    var pic = cardPicture(d.items, cardBounds(d.items, a), a, col);
    SK.whenImages(visible(d.items)).then(function () {
      if (pic.parentNode) pic.getContext('2d').drawImage(cardPicture(d.items, cardBounds(d.items, a), a, col), 0, 0);
    });
    var del = el('button', { class: 'lib-del', text: '×', title: 'Move to the cloud recycle bin', 'aria-label': 'Move ' + d.name + ' to the cloud recycle bin', on: { click: function (e) {
      e.stopPropagation();
      deleteFromCloud(d);
    } } });
    var card = el('article', { class: 'lib-card' + (d.id === detail.id ? ' on' : ''), role: 'button', tabindex: '0' }, [
      del,
      pic,
      el('span', { class: 'flip-label' }),
      el('b', { text: d.name }),
      el('span', { class: 'muted', text: SK.scaleOf(d.scale).label + (d.cloud.parent_id ? ' · branch' : '') }),
      el('span', { class: 'stars-line', text: starsText(ratingOf(d)), title: ratingOf(d) + ' of 5 stars' }),
      el('span', { class: 'meta', text: d.items.length + ' elements' }),
      el('span', { class: 'meta', text: editedLine(d) }),
      tagsLine(d.tags || []),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn small', text: 'Recordings', on: { click: function (e) { e.stopPropagation(); renderCloudDetail(d.cloud); } } })
      ])
    ]);
    bindFlip(card, pic, d);   // hold to preview, as on a local card
    card.addEventListener('click', function () {
      if (Date.now() < card._quietUntil) return;   // the click that follows a hold must not open the summary
      showDetailInfo(d, true);
    });
    card.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); showDetailInfo(d, true); } });
    return card;
  }

  // Open a cloud detail on this device. A copy already here is kept unless the cloud one is newer and you agree.
  function openCloudDetail(d) {
    SK.DB.get('details', d.id).then(function (mine) {
      var use = mine;
      if (!mine) use = d;
      else if (d.modified > mine.modified && window.confirm('This browser has an older copy of "' + d.name + '". Replace it with the cloud version?')) use = Object.assign({}, mine, d);
      var copy = { id: use.id, name: use.name, scale: use.scale, tags: use.tags, items: use.items, parentId: use.parentId || null, created: use.created, modified: use.modified };
      var save = use === mine ? Promise.resolve() : saveDetail(copy, [], null);
      return save.then(function () {
        closeLibrary();
        return openDetail(use === mine ? mine : copy);
      });
    }).catch(function (e) { fail(e, 'Could not open: '); });
  }

  function renderCloudDetail(d) {
    var body = $('libBody');
    body.innerHTML = '';
    body.appendChild(el('div', { class: 'row' }, [
      el('button', { class: 'btn small', text: '← All uploads', on: { click: renderCloud } }),
      el('b', { text: d.name })
    ]));
    Promise.all([SK.Cloud.recordingsOf(d.id), SK.Cloud.snapshotsOf(d.id)]).then(function (r) {
      var recs = r[0], snaps = r[1];
      if (!recs.length) body.appendChild(el('p', { class: 'muted', text: 'No recordings uploaded for this detail yet.' }));
      return Promise.all(recs.map(function (rec) {
        var mine = snaps.filter(function (s) { return s.recording_id === rec.id; });
        var audio = rec.audio_path ? SK.Cloud.signedUrl(rec.audio_path).then(function (u) {
          return el('audio', { controls: true, preload: 'none', src: u });
        }) : Promise.resolve(el('span', { class: 'muted', text: 'No sound in this recording.' }));
        return audio.then(function (player) {
          return el('article', { class: 'rec-review' }, [
            el('b', { text: new Date(rec.recorded_at).toLocaleString() + ' · ' + SK.formatTime(rec.duration_ms) + ' · ' + mine.length + (mine.length === 1 ? ' scene' : ' scenes') }),
            player,
            el('div', { class: 'snaps' }, mine.map(snapCard))
          ]);
        });
      })).then(function (boxes) { boxes.forEach(function (b) { body.appendChild(b); }); });
    }).catch(function (e) { fail(e, 'Could not open: '); });
  }

  function snapCard(s) {
    var img = el('img', { alt: 'Scene ' + s.scene_index });
    SK.Cloud.signedUrl(s.image_path).then(function (u) { img.src = u; }).catch(function () {});
    var words = s.said ? ' · ' + SK.firstWords(s.said, 10) : '';
    return el('figure', { class: 'snap' }, [img, el('figcaption', { text: 'Scene ' + s.scene_index + ' · ' + SK.formatTime(s.start_ms) + words })]);
  }

  // Everything one upload needs: the plan, and the media behind each path (audio, scene pictures, metadata).
  function buildUpload() {
    var an = analysis();
    var plan = SK.cloudPlan(detail, sessions, an);
    var media = {};
    var jobs = [];
    plan.files.forEach(function (f) {
      if (f.kind === 'metadata') {
        media[f.path] = new Blob([JSON.stringify(SK.detailMetadata(detail, an), null, 1)], { type: 'application/json' });
        return;
      }
      if (f.kind === 'parallel') {
        media[f.path] = new Blob([JSON.stringify(parallelOf(detail, sessions, null), null, 1)], { type: 'application/json' });
        return;
      }
      var s = sessions.filter(function (x) { return x.id === f.sessionId; })[0];
      if (f.kind === 'audio') { media[f.path] = s.audio; return; }
      var sc = an.scenes.filter(function (x) { return x.sessionId === f.sessionId && x.index === f.sceneIndex; })[0];
      var items = SK.stateAt(s, sc.end);
      var b = SK.itemsBounds(visible(SK.printable(items)), ac()) || SK.itemsBounds(visible(SK.printable(detail.items)), ac());
      if (!b) return;
      jobs.push(new Promise(function (resolve) {
        sheetCanvas(items, b, detail).toBlob(function (blob) { media[f.path] = blob; resolve(); }, 'image/jpeg', 0.9);
      }));
    });
    return Promise.all(jobs).then(function () { return { plan: plan, media: media }; });
  }

  function uploadToCloud() {
    if (take) stopRecording();
    SK.Cloud.session().then(function (s) {
      if (!s) {
        toast('Sign in first. Open Library → Cloud to get the link.');
        lib.view = 'cloud';
        openLibrary();
        return null;
      }
      toast('Preparing the upload…');
      return buildUpload().then(function (u) {
        return SK.Cloud.upload(u.plan, u.media, toast).then(function (res) {
          toast('Uploaded "' + detail.name + '": ' + res.recordings + (res.recordings === 1 ? ' recording.' : ' recordings.'));
        });
      });
    }).catch(function (e) { fail(e, 'Upload failed: '); });
  }

  // Frames for flipping: one picture per scene, all at the same view so they line up.
  // A detail with no recordings builds up instead: up to 12 steps, from the first items to the whole drawing.
  function buildUpFrames(d, a, col) {
    var items = d.items || [];
    if (items.length < 2) return [];
    var b = cardBounds(items, a);
    var steps = Math.min(12, items.length), out = [];
    for (var i = 1; i <= steps; i++) {
      var n = Math.ceil(items.length * i / steps);
      out.push({ canvas: cardPicture(items.slice(0, n), b, a, col), label: 'Drawing · ' + n + ' of ' + items.length });
    }
    return out;
  }

  function framesFor(d) {
    var key = (d.cloud ? 'cloud:' : 'local:') + d.id;   // a cloud detail and its local copy can differ
    if (lib.frames[key]) return Promise.resolve(lib.frames[key]);
    var sess = lib.sessions[d.id] || [];
    var byId = {};
    var all = [];
    sess.forEach(function (s) {
      byId[s.id] = s;
      all = all.concat(s.base);
      s.events.forEach(function (ev) {
        if (ev.type === 'put') all.push(ev.item);
        else if (ev.type === 'replace') all = all.concat(ev.items);
      });
    });
    var a = acFor(d);
    var col = libColors();
    var b = cardBounds(all, a) || cardBounds(d.items, a);
    var frames = SK.scenesOf(sess).map(function (sc) {
      return {
        canvas: cardPicture(SK.stateAt(byId[sc.sessionId], sc.end), b, a, col),
        label: 'Scene ' + sc.index + ' · ' + SK.formatTime(sc.start)
      };
    });
    if (!frames.length) frames = buildUpFrames(d, a, col);
    lib.frames[key] = frames;
    return Promise.resolve(frames);
  }

  // Hold the loaded detail's card to flip through its scenes like a flip book. Release to see the detail as it is now.
  function bindFlip(card, pic, d) {
    var HOLD_MS = 220, FRAME_MS = 300;
    var timer = 0, tickId = 0, frames = null, flipping = false, saved = null, idx = 0;
    var label = card.querySelector('.flip-label');
    card._quietUntil = 0;

    function show(i) {
      var c = pic.getContext('2d');
      c.clearRect(0, 0, pic.width, pic.height);
      c.drawImage(frames[i].canvas, 0, 0);
      label.textContent = frames[i].label;
    }

    function start() {
      framesFor(d).then(function (fr) {
        if (!flipping) return;
        if (!fr.length) { flipping = false; return; }
        frames = fr;
        idx = 0;
        saved = document.createElement('canvas');
        saved.width = pic.width;
        saved.height = pic.height;
        saved.getContext('2d').drawImage(pic, 0, 0);
        card.classList.add('flipping');
        show(0);
        tickId = setInterval(function () { idx = (idx + 1) % frames.length; show(idx); }, FRAME_MS);
      });
    }

    function stop() {
      clearTimeout(timer);
      clearInterval(tickId);
      if (flipping && saved) {
        pic.getContext('2d').clearRect(0, 0, pic.width, pic.height);
        pic.getContext('2d').drawImage(saved, 0, 0);
      }
      flipping = false;
      card.classList.remove('flipping');
      label.textContent = '';
      card._quietUntil = Date.now() + 400;   // the click that follows a hold must not open the detail
    }

    card.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      clearTimeout(timer);
      timer = setTimeout(function () { flipping = true; start(); }, HOLD_MS);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
      card.addEventListener(ev, function () {
        clearTimeout(timer);
        if (flipping) stop();
      });
    });
    card.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }


  var BACKGROUNDS = [
    { v: '#bdbdbd', l: 'Gray (default)' },
    { v: '#000000', l: 'Black' },
    { v: '#ffffff', l: 'White' },
    { v: '#f3ead7', l: 'Cream' },
    { v: '#2b3a4a', l: 'Slate' }
  ];

  function saveSettings() { SK.DB.put('kv', settings, 'settings').catch(function () {}); }

  function refreshSettings() {
    var body = $('panelBody');
    body.innerHTML = '';
    renderSettings(body);
  }

  function setBackground(v) {
    settings.bg = v;
    saveSettings();
    redraw();
    refreshSettings();
  }

  function appearanceSection() {
    var swatches = BACKGROUNDS.map(function (b) {
      return el('button', { class: 'swatch' + (settings.bg === b.v ? ' on' : ''), title: b.l, 'aria-label': b.l, style: 'background:' + b.v, on: { click: function () { setBackground(b.v); } } });
    });
    var custom = el('input', { type: 'color', value: settings.bg, 'aria-label': 'Custom background colour', on: { change: function (e) { setBackground(e.target.value); } } });
    var grid = el('input', { type: 'checkbox', checked: settings.grid, on: { change: function (e) {
      settings.grid = e.target.checked;
      saveSettings();
      redraw();
    } } });
    return section('Appearance', [
      el('div', { class: 'swatches' }, swatches.concat([el('label', { class: 'swatch custom', title: 'Custom colour' }, [custom])])),
      el('p', { class: 'muted', text: 'Black ink turns white on a dark background. PNG export has no background.' }),
      el('label', { class: 'check' }, [grid, ' Show the reference grid (one printed inch a square, major lines every 5 in.; on screen only, never printed or exported)'])
    ]);
  }

  function renderSettings(body) {
    var caps = el('input', { type: 'checkbox', checked: settings.caps, on: { change: function (e) {
      settings.caps = e.target.checked;
      SK.DB.put('kv', settings, 'settings').catch(function () {});
      redraw();
    } } });
    var round = el('select', { class: 'field', on: { change: function (e) {
      settings.roundTo = +e.target.value;
      SK.DB.put('kv', settings, 'settings').catch(function () {});
      redraw();
    } } });
    ROUNDINGS.forEach(function (r) { round.appendChild(el('option', { value: r.v, text: r.l, selected: r.v === settings.roundTo })); });

    var versions = el('ul', { class: 'versions' }, [
      el('li', {}, [el('b', { text: 'v4 · current' }), el('span', { text: 'Blocks, hatch patterns, cloud library, GIF of recordings' })]),
      el('li', {}, [el('b', { text: 'v3' }), el('span', { text: 'Endless sheet, scenes, notes, dimensions, library' })]),
      el('li', {}, [el('a', { href: 'history/v2/index.html', text: 'v2 · Wall sketch' }), el('span', { text: 'Blank sheet with recording and replay' })]),
      el('li', {}, [el('a', { href: 'history/v1/index.html', text: 'v1 · Quick Detail' }), el('span', { text: 'Detail editor with tools, meaning and exports' })])
    ]);

    // Changes made in v4, newest first. Add a line here with each change a user would notice.
    var CHANGES = [
      ['31 Oct', 'Left bar is one panel with dividers; the microphone sits on its own row above the scene button'],
      ['31 Oct', 'Small screens: tools that do not fit on the left bar move to a second column behind a + button'],
      ['31 Oct', 'Left bar tools are centred on the bar\'s centre line'],
      ['31 Oct', 'Undo: hold it to open Redo on the right, drag onto it and let go; Ctrl+Shift+Z and Ctrl+Y also redo'],
      ['31 Oct', 'Element pop-up: Duplicate, and layer order (front, forward, back, send to back) for every drawable element'],
      ['31 Oct', 'Colour and line weight: one dot each; tap or drag along the row to choose; the choice is remembered'],
      ['31 Oct', 'Reference grid on the sheet, on by default, screen only and never in exports: one true inch a square, shades of the background; every fifth line is major'],
      ['31 Oct', 'Left bar starts from the lower left corner, above the title block, and grows upwards'],
      ['31 Oct', 'Phone: a narrower left bar, with tools still easy to tap'],
      ['31 Oct', 'Graphic scale bar keeps a fixed length; its label changes from inches to feet as you zoom'],
      ['31 Oct', 'Reference grid follows the scale: a square is one printed inch and the major lines print at 5 in. x 5 in. at any scale'],
      ['31 Oct', 'Library: All and the sort are visible by default; one list sorted by last edited (or created); edited and created dates on every card'],
      ['31 Oct', 'Edit tags page: tags as panels with thumbnails; delete and replace a tag with a confirm; element tags as their own list; undo lasts for the page'],
      ['31 Oct', 'Ratings: 0 to 5 stars on each detail, new details start at 1, and the library sorts by rating'],
      ['31 Oct', 'Library header: sort (⇅) and + menus, recycle bin and Edit tags buttons; tags are back under + and element tags are no longer tags'],
      ['31 Oct', 'Cloud recycle bin: × on each cloud card moves it to the bin, where it can be restored or deleted for good. The local copy stays'],
      ['29 Oct', 'GIF button in a detail\'s info panel, for local and cloud details: an animated GIF of its recordings'],
      ['29 Oct', 'Library: hold a card to preview it; Rename in the info panel; clearer buttons'],
      ['29 Oct', 'Starts with a visible message if the sheet fails to load (for example a stale cached script)'],
      ['29 Oct', 'Library header: Back at the top, tags under More, New detail removed'],
      ['29 Oct', 'Cloud library options, zoom to extents, 6 in. start view'],
      ['29 Oct', 'Recording, select tool, recycle bin, names, ten starter details'],
      ['29 Oct', 'Blocks: insert one detail into another as a block; branch a block as a new version'],
      ['29 Oct', 'Cloud library works like the local one; cloud details open on this device'],
      ['29 Oct', 'Images as underlays, hidden by hand; library background switch'],
      ['29 Oct', 'Roof and floor details as drawing specs'],
      ['29 Oct', 'A JSON file of each detail, with its takes, kept on disk and uploaded with cloud saves'],
      ['29 Oct', 'Library: filter by several tags at once'],
      ['29 Oct', 'Undo on the left rail; scale bar holds two grid ticks; details can be drawn from JSON'],
      ['28 Oct', 'Library: hold-to-flip on the loaded detail only'],
      ['28 Oct', 'Hatch patterns follow section conventions; tighter left rail'],
      ['28 Oct', 'Eraser, hatch patterns, yellow pen, zoom limits; no page zoom on iPad'],
      ['27 Oct', 'Cloud collections, drawing-view background and grid, pen colours and weights'],
      ['27 Oct', 'Password sign-in and password reset in the cloud sign-in form'],
      ['27 Oct', 'Cloud sync to the Architecture project; library review'],
      ['27 Oct', 'Elements tagged from speech and geometry; library page; metadata in exports']
    ];
    var changes = el('ul', { class: 'versions' }, CHANGES.map(function (c) {
      return el('li', {}, [el('b', { text: c[0] }), el('span', { text: c[1] })]);
    }));

    var autoCollapse = el('input', { type: 'checkbox', checked: settings.autoCollapse, on: { change: function (e) {
      settings.autoCollapse = e.target.checked;
      saveSettings();
      setCollapsed(!!sel && settings.autoCollapse);
    } } });

    [
      appearanceSection(),
      section('Toolbars', [
        el('label', { class: 'check' }, [autoCollapse, ' Hide both toolbars while an object is selected (more room on a phone or iPad)']),
        el('p', { class: 'muted small', text: 'The lower-right ⤢ button hides or shows the toolbars at any time.' })
      ]),
      section('Notes', [el('label', { class: 'check' }, [caps, ' Write notes in capitals'])]),
      section('Dimensions', [el('label', { class: 'check' }, ['Round to ', round])]),
      section('Version log', [versions, el('p', { class: 'muted', text: 'Earlier versions keep their own saved work.' }), el('p', { class: 'muted small', text: 'Changes in v4, newest first' }), changes]),
      section('Keys', [el('p', { class: 'muted small', text: 'T text · D dimension · H hatch · E erase · G grid · U underlays · N new scene · F fit · Ctrl+Z undo · Delete removes the selection · Esc cancels · Space+drag or right-drag pans · Ctrl+wheel or pinch zooms' })]),
      section('Pen and fingers', [el('p', { class: 'muted small', text: 'Once a pen is used, fingers pan and pinch and only the pen draws. Without a pen, one finger draws and two fingers pan and zoom.' })])
    ].forEach(function (s) { body.appendChild(s); });
  }

  // ---- save as, branch, merge, delete ----

  function copySessions(fromList, toId) {
    return Promise.all(fromList.map(function (s) {
      var c = Object.assign({}, s, { id: uid('r'), detailId: toId });
      delete c._scenes;
      return SK.DB.put('sessions', c);
    }));
  }

  function saveAs() {
    var name = window.prompt('Save as', detail.name + ' copy');
    if (!name) return;
    stopRecording().then(function () {
      var d = newDetail(name.trim());
      d.scale = detail.scale;
      d.tags = detail.tags.slice();
      d.items = clone(detail.items);
      d.parentId = detail.parentId;
      return SK.DB.put('details', d)
        .then(function () { return copySessions(sessions, d.id); })
        .then(function () { closePanel(); toast('Saved as ' + d.name + ', with its scenes.'); return openDetail(d); });
    }).catch(fail);
  }

  function branchFrom(items, label) {
    stopRecording().then(function () {
      var d = newDetail(detail.name + ' — ' + label);
      d.scale = detail.scale;
      d.tags = detail.tags.slice();
      d.items = clone(items);
      d.parentId = detail.id;
      return SK.DB.put('details', d).then(function () {
        closePanel();
        toast('Branched. Edit freely; merge back from Project info.');
        return openDetail(d);
      });
    }).catch(fail);
  }

  function mergeIntoParent() {
    SK.DB.get('details', detail.parentId).then(function (p) {
      if (!p) { toast('The parent detail was deleted.'); return; }
      if (!window.confirm('Merge this branch into "' + p.name + '"? Its items are added there, and items changed here replace the old ones.')) return;
      var merged = clone(p.items);
      detail.items.forEach(function (it) {
        var i = indexOf(merged, it.id);
        if (i >= 0) merged[i] = clone(it); else merged.push(clone(it));
      });
      p.items = merged;
      p.modified = Date.now();
      return SK.DB.put('details', p).then(function () { toast('Merged into ' + p.name + '.'); });
    }).catch(fail);
  }

  // ---- blocks: a finished detail placed inside this one ----

  // A block is a detail's own underlay: faint, at 40% opacity, scale 100%, left out of prints. Null (with a reason) when it cannot go here.
  function makeBlock(src) {
    var refusal = SK.blockRefusal(detail.id, detail.items, src.id, sourceOf);
    if (refusal) { toast(refusal); return null; }
    var b = SK.itemsBounds(SK.flattenItems(src.items || [], sourceOf), acFor(src));
    if (!b) { toast(src.name + ' has no lines yet.'); return null; }
    var mid = SK.toWorld(view, [W() / 2, H() / 2]);
    return { id: uid('b'), kind: 'block', sourceId: src.id, at: [mid[0] - (b.minx + b.maxx) / 2, mid[1] - (b.miny + b.maxy) / 2], k: 1, opacity: 0.4, print: false };
  }

  // Places a block of src at the centre of the view, so it lands where you are looking.
  function addBlock(src) {
    var item = makeBlock(src);
    if (!item) return;
    closePanel();
    commitPut(item, null);
    select(item.id);
    toast('Block added. Draw over it freely. Use the arrow tool to move it, or its chips to scale and fade it.');
  }

  // A block detail is named Block_… (Block_door, Block_roof, Block_hatch), or tagged block.
  function isBlockDetail(d) {
    return /^block_/i.test(d.name || '') || (d.tags || []).indexOf('block') >= 0;
  }

  // Opens the block's detail for editing. Its blocks then show the pop-up, and Branch can repoint this one.
  function openSource(bk) {
    var from = detail.id;
    SK.DB.get('details', bk.sourceId).then(function (src) {
      if (!src) { toast('That detail is not on this device.'); return; }
      closePanel();
      return openDetail(src, from);
    }).catch(fail);
  }

  // Replaces a block with plain copies of its lines, so this detail can change them without touching the source.
  function copyInBlock(bk) {
    var i = indexOf(detail.items, bk.id);
    if (i < 0) return;
    var copies = SK.copyInBlock(bk, sourceOf, function () { return uid('i'); });
    sel = null;
    commitReplace(detail.items.slice(0, i).concat(copies, detail.items.slice(i + 1)));
    toast('Copied in. These lines are now part of this detail only.');
  }

  // Blocks in this detail, and the picker that adds another finished detail as a block.
  function blocksSection() {
    return blocksPicker().concat([blocksChecklist()]);
  }

  // Block details as a checklist, scrollable. Ticked means this detail has a block of it; unticking removes it.
  function blocksChecklist() {
    var list = el('div', { class: 'block-list' });
    var libs = allDetails.filter(function (d) { return d.id !== detail.id && isBlockDetail(d); })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    if (!libs.length) {
      return el('p', { class: 'muted', text: 'No block details yet. Name a finished detail Block_ and its kind, for example Block_door, and it will appear here.' });
    }
    libs.forEach(function (d) {
      var box = el('input', { type: 'checkbox', 'aria-label': 'Block ' + d.name });
      box.checked = detail.items.some(function (it) { return it.kind === 'block' && it.sourceId === d.id; });
      box.addEventListener('change', function () {
        if (box.checked) {
          var item = makeBlock(d);
          if (!item) { box.checked = false; return; }
          commitPut(item, null);
          select(item.id);   // its chips appear, for scale and opacity
          return;
        }
        detail.items.filter(function (it) { return it.kind === 'block' && it.sourceId === d.id; })
          .forEach(function (it) { commitDel(it.id); });
      });
      list.appendChild(el('label', { class: 'check-row' }, [box, ' ' + d.name]));
    });
    return list;
  }

  function blocksPicker() {
    var here = detail.items.filter(function (it) { return it.kind === 'block'; });
    var picker = el('select', { class: 'field', 'aria-label': 'Finished detail to add as a block' });
    picker.appendChild(el('option', { value: '', text: 'Add a finished detail as a block…' }));
    allDetails
      .filter(function (d) { return d.id !== detail.id && (d.items || []).length && !SK.blockRefusal(detail.id, detail.items, d.id, sourceOf); })
      .sort(function (a, b) { return a.name.localeCompare(b.name); })
      .forEach(function (d) { picker.appendChild(el('option', { value: d.id, text: d.name })); });
    picker.addEventListener('change', function () { if (picker.value) addBlock(sourceOf(picker.value)); });
    var note = here.length
      ? here.length + (here.length === 1 ? ' block' : ' blocks') + ' in this detail. Tap one on the sheet to open its source or copy its lines in.'
      : 'No blocks yet. A block shows a finished detail here, and edits to that detail show here too.';
    var origin = detail.versionOf && sourceOf(detail.versionOf);
    return [
      origin ? el('p', { class: 'muted', text: 'A version of "' + origin.name + '". The original is unchanged.' }) : null,
      el('p', { class: 'muted', text: note }),
      picker
    ];
  }

  // The pop-up: shown when a detail that other details use is opened, so everyone is aware of the links.
  function showBlockPopup(d, users) {
    var names = users.map(function (u) { return u.name; }).join(', ');
    var back = null;
    function close() { if (back) back.remove(); }
    var card = el('div', { class: 'pop-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Used in blocks' }, [
      el('b', { text: d.name + ' is used in ' + users.length + (users.length === 1 ? ' block' : ' blocks') }),
      el('p', { class: 'muted', text: 'Edits here change every block that uses it: ' + names + '. To keep this copy untouched, branch it as a new version.' }),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn', text: 'Keep editing', on: { click: close } }),
        el('button', { class: 'btn', text: 'Branch as new version', on: { click: function () { close(); branchVersion(d); } } }),
        originHost ? el('button', { class: 'btn', text: 'Back to the detail I came from', on: { click: function () {
          close();
          SK.DB.get('details', originHost).then(function (p) { if (p) return openDetail(p); }).catch(fail);
        } } }) : null
      ])
    ]);
    back = el('div', { class: 'pop-back' }, [card]);
    document.body.appendChild(back);
    card.querySelector('.btn').focus();
  }

  // A new detail with the same lines, linked to the one it came from but never merged into it. The original stays as it is.
  // The block this detail was opened from is pointed at the new version; other blocks keep the original.
  function branchVersion(d) {
    var v = newDetail(d.name + ' — version');
    v.scale = d.scale;
    v.tags = (d.tags || []).slice();
    v.items = clone(d.items);
    v.versionOf = d.id;
    var host = originHost;
    stopRecording().then(function () {
      return host ? repointBlock(host, d.id, v.id) : null;
    }).then(function () {
      return saveDetail(v, [], null);
    }).then(function () {
      toast('Made a new version. The original is unchanged.');
      return openDetail(v);
    }).catch(fail);
  }

  function repointBlock(hostId, fromId, toId) {
    return SK.DB.get('details', hostId).then(function (host) {
      if (!host) return;
      var moved = false;
      host.items = host.items.map(function (it) {
        if (it.kind !== 'block' || it.sourceId !== fromId) return it;
        moved = true;
        return Object.assign({}, it, { sourceId: toId });
      });
      if (!moved) return;
      host.modified = Date.now();
      cacheDetail(host);
      return SK.DB.put('details', host);
    });
  }

  // The open detail goes to the recycle bin, and another detail opens in its place.
  function deleteDetail() {
    confirmDelete(detail, function () {
      var gone = detail;
      stopRecording().then(function () {
        gone.deletedAt = Date.now();
        return SK.DB.put('details', gone);
      }).then(function () { cacheDetail(gone); return SK.DB.all('details'); })
        .then(function (list) {
          closePanel();
          list = list.filter(function (d) { return !d.deletedAt; }).sort(function (a, b) { return b.modified - a.modified; });
          var next = list[0] || newDetail();
          if (!list[0]) return SK.DB.put('details', next).then(function () { cacheDetail(next); return openDetail(next); });
          return openDetail(next);
        }).catch(fail);
    });
  }

  // ---- log: a film strip of every scene ----

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

  function renderLog() {
    var strip = $('logStrip');
    strip.innerHTML = '';
    var total = 0;
    sessions.forEach(function (s) { total += scenesOf(s).length; });
    $('logTitle').textContent = detail.name + ' · ' + total + (total === 1 ? ' scene' : ' scenes');
    if (!sessions.length) {
      strip.appendChild(el('p', { class: 'muted empty', text: 'No scenes yet. Start drawing: recording starts with the pen and stops 5 seconds after you lift it. Tap the scene button to start a new scene while you talk.' }));
      return;
    }
    var col = colors();
    var n = 0;
    sessions.forEach(function (s) {
      var when = new Date(s.created);
      strip.appendChild(el('div', { class: 'divider' }, [
        el('b', { text: when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }),
        el('span', { text: when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) + ' · ' + SK.formatTime(s.duration) + (s.audio ? '' : ' · no sound') })
      ]));
      var b = sessionBounds(s);
      scenesOf(s).forEach(function (m) {
        n++;
        var thumb = el('div', { class: 'thumb' });
        var full = el('div', { class: 'more' }, [
          el('p', { text: m.text || 'Nothing was said in this scene.' }),
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
              branchFrom(SK.stateAt(s, m.end), 'branch from scene ' + num);
            } } })
          ])
        ]);
        var num = n;
        var card = el('article', { class: 'card' + (m.marked ? ' marked' : ''), on: { click: function () { card.classList.toggle('open'); } } }, [
          thumb,
          el('b', { text: 'Scene ' + num + ' · ' + SK.formatTime(m.start) }),
          el('p', { class: 'words', text: m.text ? SK.firstWords(m.text, 8) : '(no words)' }),
          full
        ]);
        card._paint = function () {
          thumb.appendChild(SK.picture(visible(SK.stateAt(s, m.end)), b, 200, 130, { ac: acFor(detail, s.scale), ink: col.ink, paper: col.paper }));
        };
        strip.appendChild(card);
        if (thumbObserver) thumbObserver.observe(card); else card._paint();
      });
    });
    strip.scrollLeft = strip.scrollWidth;
  }

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
    $('player').hidden = false;
    document.body.classList.add('replaying');
    seekTo(T || 0);
  }

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

  function seekTo(T) {
    setT(T);
    pb.startT = pb.T;
    pb.startedAt = performance.now();
    if (pb.audio) pb.audio.currentTime = Math.max(0, pb.T - (pb.s.audioOffset || 0)) / 1000;
  }

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

  function pausePlay() {
    if (!pb || !pb.playing) return;
    pb.playing = false;
    cancelAnimationFrame(pb.raf);
    if (pb.audio) pb.audio.pause();
    setT(pb.T);
  }

  function frame() {
    if (!pb || !pb.playing) return;
    var T = pb.startT + performance.now() - pb.startedAt;
    if (T >= pb.s.duration) { setT(pb.s.duration); pausePlay(); return; }
    setT(T);
    pb.raf = requestAnimationFrame(frame);
  }

  function exitReplay() {
    if (!pb) return;
    pausePlay();
    if (pb.url) URL.revokeObjectURL(pb.url);
    view = pb.savedView;
    pb = null;
    $('player').hidden = true;
    document.body.classList.remove('replaying');
    redraw();
  }

  $('playBtn').addEventListener('click', function () { if (pb) { if (pb.playing) pausePlay(); else startPlay(); } });
  $('exitBtn').addEventListener('click', exitReplay);
  $('scrub').addEventListener('input', function (e) { pausePlay(); seekTo(+e.target.value); });

  // ---- exports ----

  // A white sheet at 150 dpi of paper, cropped to the drawing, with the detail title under it.
  function sheetCanvas(items, b, d, opts) {
    opts = opts || {};
    var dpi = 150, f = factorOf(d);
    var z = dpi / f;
    var margin = 0.4 * dpi, titleH = 1.0 * dpi;
    var bw = (b.maxx - b.minx) * z, bh = (b.maxy - b.miny) * z;
    var k = Math.min(1, 7000 / Math.max(bw + 2 * margin, bh + 2 * margin + titleH));
    z *= k;
    var w = Math.ceil(Math.max(bw * k + 2 * margin, 3.2 * dpi)), h = Math.ceil(bh * k + 2 * margin + titleH);
    var cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    var c = cv.getContext('2d');
    var v = { x: b.minx - margin / z, y: b.miny - margin / z, z: z };
    SK.paint(c, visible(SK.printable(items)), v, { ac: acFor(d), ink: '#000', paper: '#fff', bg: '#ffffff', fill: !opts.transparent, w: w, h: h, print: true });
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#000';
    c.textAlign = 'left';
    c.font = 'bold ' + Math.round(0.16 * dpi) + 'px ' + SK.FONT;
    var name = (d.name || 'Untitled detail').toUpperCase();
    var ty = h - titleH + 0.3 * dpi;
    c.fillText(name, margin, ty);
    c.fillRect(margin, ty + 0.06 * dpi, Math.max(c.measureText(name).width, 1.5 * dpi), Math.max(2, 0.012 * dpi));
    c.font = Math.round(0.11 * dpi) + 'px ' + SK.FONT;
    c.fillText(d.scale === 'NTS' ? 'NOT TO SCALE' : 'SCALE: ' + SK.scaleOf(d.scale).label, margin, ty + 0.25 * dpi);
    if (d.tags && d.tags.length) c.fillText('TAGS: ' + d.tags.join(', ').toUpperCase(), margin, ty + 0.42 * dpi);
    return cv;
  }

  function jpeg(cv, name) {
    return new Promise(function (resolve) {
      cv.toBlob(function (blob) { download(blob, name); resolve(); }, 'image/jpeg', 0.92);
    });
  }

  // Current analysis of the open detail, with every element's tags and every scene's transcript.
  function analysis() { return SK.analyze(detail, sessions, ac()); }

  function metadataPreview() {
    if (!detail.items.length) return 'Nothing to describe yet. Draw, talk, then tag the elements.';
    return SK.detailMetadata(detail, analysis()).summary;
  }

  // Tags each element from its shape and from what was said while it was drawn. Stored on the element as meta.
  function tagElements() {
    var an = analysis();
    var byId = {};
    an.elements.forEach(function (e) { byId[e.id] = e; });
    detail.items = detail.items.map(function (it) {
      var e = byId[it.id];
      if (!e) return it;
      var n = clone(it);
      n.meta = SK.itemMeta(e);
      return n;
    });
    detail.modified = Date.now();
    saveNow().then(function () {
      toast('Tagged ' + an.elements.length + (an.elements.length === 1 ? ' element.' : ' elements.'));
      if (panelKind === 'project') {
        var body = $('panelBody');
        body.innerHTML = '';
        renderProject(body);
      }
    }).catch(function (e) { fail(e, 'Could not save the tags: '); });
  }

  // A JPEG with its metadata inside it (a JPEG comment), and the same metadata as a sidecar file.
  // If the metadata is too big for a comment, the image gets the summary and element labels only.
  function jpegWithMeta(cv, name, meta) {
    return new Promise(function (resolve, reject) {
      cv.toBlob(function (blob) {
        blob.arrayBuffer().then(function (buf) {
          var bytes = new Uint8Array(buf);
          var tagged;
          try {
            tagged = SK.jpegWithComment(bytes, JSON.stringify(meta));
          } catch (err) {
            var slim = clone(meta);
            slim.scenes = (slim.scenes || []).map(function (sc) { return { index: sc.index, at: sc.at, said: (sc.said || '').slice(0, 160) }; });
            slim.elements = (slim.elements || []).map(function (e) { return { type: e.type, label: e.label, tags: e.tags }; });
            slim.truncated = true;
            tagged = SK.jpegWithComment(bytes, JSON.stringify(slim));
          }
          download(new Blob([tagged], { type: 'image/jpeg' }), name);
          download(new Blob([JSON.stringify(meta, null, 1)], { type: 'application/json' }), name.replace(/\.jpg$/, '.metadata.json'));
          resolve();
        }).catch(reject);
      }, 'image/jpeg', 0.92);
    });
  }

  function exportPng() {
    var b = SK.itemsBounds(visible(SK.printable(detail.items)), ac());
    if (!b) { toast('Nothing to export yet.'); return; }
    sheetCanvas(detail.items, b, detail, { transparent: true }).toBlob(function (blob) {
      download(blob, slug(detail.name) + '.png');
    }, 'image/png');
  }

  function exportJpeg() {
    var b = SK.itemsBounds(visible(SK.printable(detail.items)), ac());
    if (!b) { toast('Nothing to export yet.'); return; }
    var an = analysis();
    var meta = SK.detailMetadata(detail, an);
    jpegWithMeta(sheetCanvas(detail.items, b, detail), slug(detail.name) + '.jpg', meta).catch(fail);
  }

  // One image per scene, each with the scene's own metadata and the elements on the sheet by then.
  function exportSeries() {
    var an = analysis();
    if (!an.scenes.length) { toast('No scenes to export yet.'); return; }
    var byId = {};
    sessions.forEach(function (s) { byId[s.id] = s; });
    var frames = an.scenes.map(function (sc) {
      var items = SK.stateAt(byId[sc.sessionId], sc.end);
      return { items: items, sc: sc, ids: items.map(function (it) { return it.id; }) };
    });
    var pts = [];
    sessions.forEach(function (s) {
      var sb = sessionBounds(s);
      if (sb) pts.push([sb.minx, sb.miny], [sb.maxx, sb.maxy]);
    });
    var b = SK.boundsOf(pts) || SK.itemsBounds(visible(detail.items), ac());
    if (!b) { toast('Nothing to export yet.'); return; }
    toast('Exporting ' + frames.length + ' images. Allow multiple downloads if asked.');
    var i = 0;
    (function next() {
      if (i >= frames.length) return;
      var f = frames[i];
      i++;
      var name = slug(detail.name) + '-scene-' + (i < 10 ? '0' : '') + i + '.jpg';
      var meta = SK.sceneMetadata(detail, an, f.sc, f.ids);
      jpegWithMeta(sheetCanvas(f.items, b, detail), name, meta)
        .then(function () { setTimeout(next, 500); })
        .catch(fail);
    })();
  }

  function exportData() {
    var data = {
      app: 'wall-sketch',
      version: 3,
      exported: new Date().toISOString(),
      detail: detail,
      recordings: sessions.map(function (s) {
        return {
          id: s.id, created: new Date(s.created).toISOString(), duration: s.duration, scale: s.scale,
          hasAudio: !!s.audio, audioOffset: s.audioOffset, speech: s.speech, voice: s.voice,
          scenes: SK.segment(s).map(function (m) { return { start: m.start, end: m.end, text: m.text, items: m.ids, marked: m.marked }; }),
          base: s.base, events: s.events
        };
      })
    };
    download(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), slug(detail.name) + '.json');
  }

  function exportParallel() {
    saveNow().then(function () {
      return SK.DB.get('parallels', detail.id);
    }).then(function (p) {
      download(new Blob([JSON.stringify(p, null, 1)], { type: 'application/json' }), slug(detail.name) + '.parallel.json');
    }).catch(function (e) { fail(e, 'Could not export: '); });
  }

  // ===================================================================
  // Rail, scene button, keys
  // ===================================================================

  // Left rail: pen colours, line weights, and the text and dimension tools.
  // Each picker shows its current choice as one dot. Tap the dot to open the row, or press it, drag along the row and let go
  // on a choice. Letting go off the row closes it without a change.
  function renderPen() {
    document.querySelectorAll('#colorPicker [data-color]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-color') === pen.color); });
    document.querySelectorAll('#weightPicker [data-weight]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-weight') === pen.weight); });
    var cur = $('colorCur');
    cur.className = 'pick-cur pen-' + pen.color;
    var wcur = $('weightCur');
    wcur.setAttribute('data-w', pen.weight);
  }
  function setupPicker(boxId, attr, apply) {
    var box = $(boxId), cur = box.querySelector('.pick-cur'), row = box.querySelector('.pick-row');
    var pressing = false;
    function open(on) { row.hidden = !on; cur.setAttribute('aria-expanded', on ? 'true' : 'false'); if (!on) row.querySelectorAll('.hot').forEach(function (b) { b.classList.remove('hot'); }); }
    function swatchAt(x, y) {
      var t = document.elementFromPoint(x, y), b = t && t.closest ? t.closest('[' + attr + ']') : null;
      return b && row.contains(b) ? b : null;
    }
    function choose(b) { apply(b.getAttribute(attr)); open(false); }
    cur.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      e.preventDefault();
      if (!row.hidden) { open(false); return; }   // a second tap on the dot closes it
      open(true);
      pressing = true;
    });
    window.addEventListener('pointermove', function (e) {
      if (!pressing || row.hidden) return;
      var over = swatchAt(e.clientX, e.clientY);
      row.querySelectorAll('[' + attr + ']').forEach(function (b) { b.classList.toggle('hot', b === over); });
    });
    window.addEventListener('pointerup', function (e) {
      if (!pressing) return;
      pressing = false;
      var b = swatchAt(e.clientX, e.clientY);
      if (b) { choose(b); return; }
      var t = document.elementFromPoint(e.clientX, e.clientY);
      if (!(t && box.contains(t))) open(false);   // let go somewhere else: close without a change
    });
    row.addEventListener('click', function (e) {
      var b = e.target.closest('[' + attr + ']');
      if (b) choose(b);
    });
    document.addEventListener('pointerdown', function (e) {
      if (!row.hidden && !box.contains(e.target)) open(false);
    });
  }
  setupPicker('colorPicker', 'data-color', function (v) {
    pen.color = v; savePen(); renderPen(); if (tool === 'select') setTool('draw');
  });
  setupPicker('weightPicker', 'data-weight', function (v) {
    pen.weight = v; savePen(); renderPen(); if (tool === 'select') setTool('draw');
  });
  $('lrail').addEventListener('click', function (e) {
    var a = e.target.closest('[data-act]');
    if (a && a.getAttribute('data-act') === 'image') $('imageFile').click();
    else if (a && a.getAttribute('data-act') === 'underlay') toggleUnderlay();
    else if (a && a.getAttribute('data-act') === 'extents') { if (pb) exitReplay(); fitAll(); }
    else if (a) {
      if (pb) exitReplay();
      var act = a.getAttribute('data-act');
      setTool(act === 'select' && tool === 'select' ? 'draw' : act);   // the arrow toggles back to drawing
    }
  });
  $('imageFile').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (file) addImage(file);
  });
  SK.onImageLoad = function () { redraw(); };

  // Underlays (no-print images) can be hidden by hand. They stay in the detail, its exports and the cloud upload.
  function toggleUnderlay() {
    settings.underlay = !settings.underlay;
    saveSettings();
    var it = sel && byId(sel.id);
    if (!settings.underlay && it && it.kind === 'image' && it.noPrint) select(null);
    renderUnderlay();
    redraw();
    toast(settings.underlay ? 'Underlays shown.' : 'Underlays hidden.');
  }
  function renderUnderlay() {
    var b = document.querySelector('#lrail [data-act="underlay"]');
    if (b) { b.classList.toggle('on', settings.underlay); b.textContent = settings.underlay ? '◐' : '○'; }
  }
  renderPen();

  // Small screens: when the left bar runs down past the screen, its last tools move into a second column, opened by the "+".
  // Each tool is put back where it was before every refit, so the bar always fills from the top.
  var LEFT_BAR_TOP = 60, LEFT_BAR_BOTTOM = 124;   // px kept clear: the title block (about 97 px) and its 14 px margin (see style.css)
  var railMoved = [];      // { unit, slot } for each tool moved out
  var railOpen = false;    // whether the second column is open
  function railHome() {
    while (railMoved.length) { var m = railMoved.pop(); m.slot.parentNode.replaceChild(m.unit, m.slot); }
  }
  function railTidy() {
    document.querySelectorAll('#lrail .lgroup.tools').forEach(function (g) { g.hidden = !g.querySelector('.tool'); });
  }
  function railShowMore() {
    var more = $('lrailMore'), plus = $('lrailPlus'), body = $('lrailMoreBody');
    var on = railOpen && body.children.length > 0;
    more.hidden = !on;
    plus.setAttribute('aria-expanded', String(on));
    plus.classList.toggle('on', on);
    if (on) {
      // The bar grows up from the lower left corner, so the second column lines up with its bottom edge.
      var r = $('lrail').getBoundingClientRect();
      more.style.left = Math.round(r.right + 10) + 'px';
      more.style.top = 'auto';
      more.style.bottom = Math.round(window.innerHeight - r.bottom) + 'px';
    }
  }
  function fitLeftRail() {
    var rail = $('lrail'), plusGroup = $('lrailMoreGroup'), body = $('lrailMoreBody');
    railHome();
    plusGroup.hidden = true;
    railTidy();
    // The bar sits between the top of the sheet and the title block at the bottom left, so that is the room it has.
    var room = window.innerHeight - LEFT_BAR_BOTTOM - LEFT_BAR_TOP;
    if (rail.getBoundingClientRect().height > room) {
      plusGroup.hidden = false;
      var units = Array.prototype.slice.call(rail.querySelectorAll('.tool, .picker'));
      for (var i = units.length - 1; i >= 0 && rail.getBoundingClientRect().height > room; i--) {
        var unit = units[i], slot = document.createElement('span');
        slot.hidden = true;
        unit.parentNode.insertBefore(slot, unit);
        railMoved.push({ unit: unit, slot: slot });
        body.insertBefore(unit, body.firstChild);   // walking up from the bottom keeps the original order
      }
      railTidy();
    }
    if (!body.children.length) railOpen = false;
    railShowMore();
  }
  $('lrailPlus').addEventListener('click', function () { railOpen = !railOpen; railShowMore(); });
  window.addEventListener('resize', fitLeftRail);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitLeftRail);
  fitLeftRail();

  // Undo: a tap undoes. Holding it opens Redo to the right. Drag onto Redo and let go to redo; let go anywhere else to cancel.
  (function () {
    var btn = $('undoCorner'), menu = $('undoMenu'), item = $('redoItem');
    var timer = null, held = false, shown = false;
    function over(x, y) { var t = document.elementFromPoint(x, y); return !!(t && (t === item || item.contains(t))); }
    function onMove(e) { if (shown) item.classList.toggle('hot', !item.disabled && over(e.clientX, e.clientY)); }
    function onUp(e) {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      var hit = shown && !item.disabled && over(e.clientX, e.clientY);
      shown = false;
      menu.hidden = true;
      item.classList.remove('hot');
      if (hit) redo();
    }
    function show() {
      held = true;
      item.disabled = !redos.length;
      item.textContent = redos.length ? 'Redo' : 'Nothing to redo';
      menu.hidden = false;
      shown = true;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    }
    btn.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      held = false;
      clearTimeout(timer);
      timer = setTimeout(function () { timer = null; show(); }, 450);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (type) {
      btn.addEventListener(type, function () { if (timer && !shown) { clearTimeout(timer); timer = null; } });
    });
    btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    btn.addEventListener('click', function () {
      if (held) { held = false; return; }   // the hold already did its work
      undo();
    });
  })();

  $('rail').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act');
    if (act === 'scene') return;
    if (act === 'undo') undo();
    else if (act === 'library') openLibrary();
    else openPanel(act);
  });

  (function () {
    var btn = $('sceneBtn'), timer = 0, held = false;
    btn.addEventListener('pointerdown', function () {
      held = false;
      SK.Mic.resume();
      timer = setTimeout(function () {
        held = true;
        if (take) { stopRecording(); toast('Recording stopped.'); }
      }, 650);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { btn.addEventListener(ev, function () { clearTimeout(timer); }); });
    btn.addEventListener('click', function () { if (!held) newScene(); });
  })();

  $('hintCancel').addEventListener('click', endDraft);
  $('libClose').addEventListener('click', closeLibrary);
  $('libSort').addEventListener('change', renderLibrary);
  document.querySelectorAll('#libBg [data-bg]').forEach(function (b) {
    b.addEventListener('click', function () {
      settings.libBg = b.getAttribute('data-bg');
      saveSettings();
      lib.frames = {};
      renderLibrary();
    });
  });
  $('libSearch').addEventListener('input', function (e) { lib.query = e.target.value; renderLibrary(); });
  document.querySelectorAll('#libPage [data-view]').forEach(function (b) {
    b.addEventListener('click', function () { lib.view = b.getAttribute('data-view'); lib.filters = []; lib.cloudRows = null; renderLibrary(); });
  });
  // Header menus and Edit tags
  $('libSortBtn').addEventListener('click', function (e) { e.stopPropagation(); toggleMenu('libSortBtn', 'libSortMenu'); });
  $('libMoreBtn').addEventListener('click', function (e) { e.stopPropagation(); toggleMenu('libMoreBtn', 'libMore'); });
  document.querySelectorAll('#libSortMenu [data-sort]').forEach(function (b) {
    b.addEventListener('click', function () { $('libSort').value = b.getAttribute('data-sort'); closeMenus(); renderLibrary(); });
  });
  document.addEventListener('click', function (e) { if (!e.target.closest || !e.target.closest('.menu-wrap')) closeMenus(); });
  $('tagsOpen').addEventListener('click', openTags);
  $('tagsClose').addEventListener('click', closeTags);
  $('tagsUndo').addEventListener('click', undoTagEdit);
  $('panelClose').addEventListener('click', closePanel);
  $('logClose').addEventListener('click', closePanel);

  document.addEventListener('keydown', function (e) {
    var tag = e.target && e.target.tagName;
    var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.key === 'Escape') {
      if (!$('tagsPage').hidden) closeTags();
      else if (!$('libPage').hidden) closeLibrary();
      else if (draft) endDraft();
      else if (sel) select(null);
      else if (panelKind) closePanel();
      else if (pb) exitReplay();
      return;
    }
    if (typing) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && e.shiftKey) { e.preventDefault(); redo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow().then(function () { toast('Saved.'); }); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ') {
      e.preventDefault();
      if (pb) { if (pb.playing) pausePlay(); else startPlay(); }
      else spaceDown = true;
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); deleteSelected(); }
    else if (e.key === 't' || e.key === 'T') setTool('text');
    else if (e.key === 'd' || e.key === 'D') setTool('dim');
    else if (e.key === 'n' || e.key === 'N') newScene();
    else if (e.key === 'e' || e.key === 'E') setTool('erase');
    else if (e.key === 'v' || e.key === 'V') setTool(tool === 'select' ? 'draw' : 'select');
    else if (e.key === 'h' || e.key === 'H') setTool('hatch');
    else if (e.key === 'g' || e.key === 'G') { settings.grid = !settings.grid; saveSettings(); redraw(); toast(settings.grid ? 'Grid on.' : 'Grid off.'); }
    else if (e.key === 'u' || e.key === 'U') toggleUnderlay();
    else if (e.key === 'f' || e.key === 'F') fitAll();
    else if (e.key === '+' || e.key === '=') zoomAt([W() / 2, H() / 2], 1.25);
    else if (e.key === '-') zoomAt([W() / 2, H() / 2], 0.8);
  });
  document.addEventListener('keyup', function (e) { if (e.key === ' ') spaceDown = false; });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stopRecording();
      SK.Mic.close();
      if (detail) saveNow().catch(function () {});
    }
  });
  // iPad: pinch zooms the sheet, never the page. Safari's own page zoom is blocked.
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (ev) {
    document.addEventListener(ev, function (e) { e.preventDefault(); }, { passive: false });
  });
  window.addEventListener('resize', resize);
  if (window.matchMedia) {
    var dark = window.matchMedia('(prefers-color-scheme: dark)');
    if (dark.addEventListener) dark.addEventListener('change', redraw);
  }

  // ===================================================================
  // Start
  // ===================================================================

  Promise.all([SK.DB.get('kv', 'settings'), SK.DB.get('kv', 'customTags'), SK.DB.get('kv', 'currentDetail'), SK.DB.all('details')])
    .then(function (r) {
      if (r[0]) settings = Object.assign(settings, r[0]);
      // The grid is on by default now. Settings saved before that carry grid: false, so switch it on once.
      if (!settings.gridOn2) { settings.grid = true; settings.gridOn2 = true; saveSettings(); }
      renderUnderlay();
      if (r[1]) customTags = r[1];
      window.__started = true;   // the page's startup-failure message stays hidden once the app is running
      setDetails(r[3]);   // names are counted from this list, so a new sketch never reuses a number
      var list = r[3].filter(function (x) { return !x.deletedAt; }).sort(function (a, b) { return b.modified - a.modified; });
      var d = list.filter(function (x) { return x.id === r[2]; })[0] || list[0];
      if (!d) { d = newDetail(); SK.DB.put('details', d); cacheDetail(d); }
      resize();
      return openDetail(d);
    })
    .catch(function (e) {
      fail(e, 'Storage is unavailable, so nothing will be kept: ');
      detail = newDetail();
      resize();
    });

  // For tools and scripts: window.QuickDetail.draw(spec) makes and opens a detail from a JSON spec.
  window.QuickDetail = { draw: drawFromSpec };

  // For the browser test.
  window.__sketch = { state: function () { return { detail: detail, sessions: sessions, take: take, view: view, sel: sel, pb: pb }; }, stopRecording: stopRecording };
})();
