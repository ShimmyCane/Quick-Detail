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
  var settings = { caps: true, roundTo: 1 / 16 };
  var counter = 0;

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
  function factorOf(d) { return SK.scaleOf(d.scale).factor; }
  function acFor(d, scaleKey) {
    return { factor: SK.scaleOf(scaleKey || d.scale).factor, caps: settings.caps, roundTo: settings.roundTo, measure: SK.measure };
  }
  function ac() { return acFor(detail); }
  function defaultZ(d) { return SK.SCREEN_PX_PER_PAPER_IN / factorOf(d); }
  function colors() {
    var cs = getComputedStyle(document.documentElement);
    return { ink: cs.getPropertyValue('--ink').trim() || '#1d1d1f', paper: cs.getPropertyValue('--paper').trim() || '#fbfaf7', accent: cs.getPropertyValue('--select').trim() || '#2f6fdd' };
  }
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

  function newDetail(name) {
    return {
      id: uid('d'), name: name || 'Untitled detail', scale: SK.DEFAULT_SCALE, tags: [], items: [],
      parentId: null, created: Date.now(), modified: Date.now()
    };
  }

  function saveSoon() {
    clearTimeout(saveTimer);
    var d = detail;
    saveTimer = setTimeout(function () { SK.DB.put('details', d).catch(function (e) { fail(e, 'Could not save: '); }); }, 400);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    return SK.DB.put('details', detail);
  }

  function homeView(d) {
    var b = SK.itemsBounds(d.items, acFor(d));
    var z = defaultZ(d);
    return SK.fitView(b, W(), H(), 80, z * 2) || { x: -W() / (2 * z), y: -H() / (2 * z), z: z };
  }

  function openDetail(d) {
    if (take) stopRecording();
    if (pb) exitReplay();
    if (detail && detail.id !== d.id) saveNow().catch(function () {});
    detail = d;
    ops = [];
    sel = null;
    endDraft();
    view = homeView(d);
    SK.DB.put('kv', d.id, 'currentDetail').catch(function () {});
    sessions = [];
    redraw();
    updateScenes();
    return SK.DB.sessionsOf(d.id).then(function (list) {
      if (detail !== d) return;
      sessions = list.sort(function (a, b) { return a.created - b.created; });
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
    logEvent({ type: 'put', item: clone(item), anim: !!anim, t: anim ? item.t0 : null });
    changed();
  }

  function commitDel(id) {
    var i = indexOf(detail.items, id);
    if (i < 0) return;
    var before = detail.items.splice(i, 1)[0];
    ops.push({ type: 'del', before: before, index: i });
    logEvent({ type: 'del', id: id });
    changed();
  }

  function commitReplace(items) {
    ops.push({ type: 'replace', before: detail.items });
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
      detail.items = op.before;
      logEvent({ type: 'replace', items: clone(op.before) });
    } else if (op.type === 'meta') {
      detail[op.key] = op.before;
    }
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
        if (detail && detail.id === s.detailId) sessions.push(s);
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
    SK.paint(ctx, list, view, { ac: pb ? acFor(detail, pb.s.scale) : ac(), ink: col.ink, paper: col.paper, ratio: dpr, w: W(), h: H() });
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
    return [];
  }

  function drawSelection(col) {
    if (!sel) return;
    var it = byId(sel.id);
    if (!it) return;
    var b = SK.itemBounds(it, ac());
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = col.accent;
    ctx.lineWidth = 1;
    if (b) {
      var p = SK.toScreen(view, [b.minx, b.miny]), q = SK.toScreen(view, [b.maxx, b.maxy]);
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(p[0] - 4, p[1] - 4, q[0] - p[0] + 8, q[1] - p[1] + 8);
      ctx.setLineDash([]);
    }
    handlesOf(it).forEach(function (h) {
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

  // Detail title in the lower left: name, scale, and a graphic scale bar for the current zoom.
  function updateTitle() {
    if (!detail) return;
    $('titleName').textContent = detail.name || 'Untitled detail';
    $('scaleLabel').textContent = detail.scale === 'NTS' ? 'NOT TO SCALE' : 'SCALE: ' + SK.scaleOf(detail.scale).label;
    var steps = [[0.25, '1/4"'], [0.5, '1/2"'], [1, '1"'], [3, '3"'], [6, '6"'], [12, "1'"], [24, "2'"], [60, "5'"], [120, "10'"], [240, "20'"]];
    var pick = steps[steps.length - 1];
    for (var i = 0; i < steps.length; i++) { if (steps[i][0] * view.z >= 36) { pick = steps[i]; break; } }
    $('scaleBar').style.width = Math.min(pick[0] * view.z, 220) + 'px';
    $('barLabel').textContent = pick[1];
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
    view.z = Math.max(0.05, Math.min(2000, view.z * k));
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
      view.z = Math.max(0.05, Math.min(2000, g.v0.z * dist(a, b) / g.d0));
      view.x = w0[0] - c[0] / view.z;
      view.y = w0[1] - c[1] / view.z;
    }
    redraw();
  }

  function fitAll() {
    view = homeView(detail);
    redraw();
  }

  // ===================================================================
  // Tools
  // ===================================================================

  function toolDown(e, sp) {
    var w = SK.toWorld(view, sp);
    if (sel) {
      var h = hitHandle(sp);
      if (h) { startHandleDrag(h, w); return; }
    }
    if (draft) { draftDown(w); return; }
    startStroke(e, w);
  }

  function toolMove(e, sp) {
    var w = SK.toWorld(view, sp);
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
    var it = { id: uid('s'), kind: 'stroke', t0: rel(e.timeStamp), w: 2.2 / view.z, pts: [] };
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

  function hitAnnotation(w) {
    var tol = HIT_PX / view.z, a = ac();
    for (var i = detail.items.length - 1; i >= 0; i--) {
      var it = detail.items[i];
      if (it.kind !== 'stroke' && SK.hitItem(it, w, tol, a)) return it;
    }
    return null;
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
    var list = detail.items.filter(function (it) { return it.id !== exceptId; });
    return SK.snap(list, w, SNAP_PX / view.z);
  }

  // ---- handle drags ----

  function startHandleDrag(h, w) {
    var it = byId(sel.id);
    drag = { id: it.id, key: h.key, before: it, w0: w };
    if (h.key.indexOf('tip:') === 0) { sel.leader = +h.key.slice(4); renderChips(); }
  }

  function moveHandleDrag(w) {
    var b = drag.before, it = clone(b), k = drag.key;
    var snapped = function () { return snapAt(w, b.id).p; };
    var f = factorOf(detail);
    if (k.indexOf('tip:') === 0) it.leaders[+k.slice(4)].tip = snapped();
    else if (k === 'move') it.at = [b.at[0] + w[0] - drag.w0[0], b.at[1] + w[1] - drag.w0[1]];
    else if (k === 'width') it.width = Math.max(SK.PAPER.text * f * 4, w[0] - b.at[0]);
    else if (k === 'height') it.height = Math.max(SK.PAPER.text * f * 1.5, w[1] - b.at[1]);
    else if (k === 'p1' || k === 'p2' || k === 'vertex') it[k] = snapped();
    else if (k === 'at') {
      it.at = w;
      if (it.mode === 'ortho') it.orient = SK.orthoOrient(it.p1, it.p2, w);
    }
    setItem(it);
    redraw();
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
    if (same || t === 'draw') return;
    tool = t;
    if (t === 'text') {
      draft = { tool: 'text', step: 0 };
      showHint('Tap the arrow point.');
    } else if (t === 'dim') {
      draft = { tool: 'dim', mode: dimMode, pts: [] };
      showDimHint();
    }
    document.querySelectorAll('.rail [data-act]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-act') === t); });
  }

  function endDraft() {
    draft = null;
    tool = 'draw';
    $('hint').hidden = true;
    document.querySelectorAll('.rail [data-act]').forEach(function (b) { b.classList.remove('on'); });
    redraw();
  }

  function showHint(text, extra) {
    $('hintText').textContent = text;
    var x = $('hintExtra');
    x.innerHTML = '';
    (extra || []).forEach(function (n) { x.appendChild(n); });
    $('hint').hidden = false;
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
    if (draft.tool === 'text' && draft.step === 1) { draft.start = w; draft.cur = w; draft.snapKind = null; }
    else draftMove(w);
  }

  function draftMove(w) {
    var placing = (draft.tool === 'text' && draft.step === 1) || (draft.tool === 'dim' && draft.placing);
    if (placing) { draft.cur = w; draft.snapKind = null; }
    else {
      var s = snapAt(w);
      draft.cur = s.p;
      draft.snapKind = s.kind;
    }
    redraw();
  }

  function draftUp(w) {
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
        id: uid('n'), kind: 'note', text: '',
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
    var d = { id: uid('m'), kind: 'dim', mode: draft.mode, at: at, text: null, size: SK.PAPER.text, end: 'tick', roundTo: null };
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
    renderChips();
    redraw();
  }

  function deleteSelected() {
    if (!sel) return;
    var id = sel.id;
    sel = null;
    commitDel(id);
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
        changed();
      }
    }
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up);
  })();

  function setScale(key) {
    if (key === detail.scale) return;
    ops.push({ type: 'meta', key: 'scale', before: detail.scale });
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
    document.querySelectorAll('.rail [data-act]').forEach(function (b) {
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
      branch,
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
        el('button', { class: 'btn', text: 'Scene series', on: { click: exportSeries } }),
        el('button', { class: 'btn', text: 'Data (JSON)', on: { click: exportData } })
      ]), el('p', { class: 'muted', text: 'Each JPEG carries its metadata inside the file, and a .metadata.json sits beside it. Data (JSON) holds everything, for rebuilding the library later.' })]),
      section('Delete', [el('button', { class: 'btn danger', text: 'Delete this detail', on: { click: deleteDetail } })])
    ].forEach(function (s) { if (s) body.appendChild(s); });
  }

  // Library page: every detail with its tags and metadata. Sort, filter by tag, and hold a card to flip through its scenes.

  var lib = { sessions: {}, frames: {}, view: 'local', query: '', filter: null };

  function sceneCountOf(d) { return SK.scenesOf(lib.sessions[d.id] || []).length; }

  // A detail's tags: the ones typed on it, plus the ones found in its tagged elements.
  function detailTags(d) {
    var out = (d.tags || []).slice();
    (d.items || []).forEach(function (it) {
      if (it.meta) (it.meta.tags || []).forEach(function (t) { if (out.indexOf(t) < 0) out.push(t); });
    });
    return out;
  }

  function openLibrary() {
    closePanel();
    if (pb) exitReplay();
    lib.frames = {};
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
    document.querySelectorAll('#libViews [data-view]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-view') === lib.view);
    });
    $('libFilters').hidden = lib.view !== 'local';
    $('libSearch').hidden = lib.view !== 'local';
    $('libSort').parentNode.hidden = lib.view !== 'local';
  }

  function renderLibrary() {
    setLibraryTabs();
    if (lib.view === 'cloud') return renderCloud();
    Promise.all([SK.DB.all('details'), SK.DB.all('sessions')]).then(function (r) {
      var details = r[0];
      lib.sessions = {};
      r[1].forEach(function (s) { (lib.sessions[s.detailId] = lib.sessions[s.detailId] || []).push(s); });

      var sort = $('libSort').value;
      details.sort(function (a, b) {
        if (sort === 'recent') return b.modified - a.modified;
        if (sort === 'scenes') return sceneCountOf(b) - sceneCountOf(a) || a.name.localeCompare(b.name);
        return a.name.localeCompare(b.name);
      });

      var tags = [];
      details.forEach(function (d) { detailTags(d).forEach(function (t) { if (tags.indexOf(t) < 0) tags.push(t); }); });
      tags.sort();
      var filters = $('libFilters');
      filters.innerHTML = '';
      filters.appendChild(el('button', { class: 'chip' + (!lib.filter ? ' on' : ''), text: 'All', on: { click: function () { lib.filter = null; renderLibrary(); } } }));
      tags.forEach(function (t) {
        filters.appendChild(el('button', { class: 'chip' + (lib.filter === t ? ' on' : ''), text: t, on: { click: function () { lib.filter = t; renderLibrary(); } } }));
      });

      var q = (lib.query || '').trim().toLowerCase();
      var shown = details.filter(function (d) {
        return (!lib.filter || detailTags(d).indexOf(lib.filter) >= 0) && (!q || matchesQuery(d, q));
      });
      var body = $('libBody');
      body.innerHTML = '';
      if (!shown.length) { body.appendChild(el('p', { class: 'muted', text: q || lib.filter ? 'Nothing matches.' : 'No details yet. Draw something, or tap New detail.' })); return; }

      var groups = {};
      shown.forEach(function (d) {
        (d.tags && d.tags.length ? d.tags : ['untagged']).forEach(function (t) { (groups[t] = groups[t] || []).push(d); });
      });
      Object.keys(groups).sort(function (a, b) {
        if (a === 'untagged') return 1;
        if (b === 'untagged') return -1;
        return a.localeCompare(b);
      }).forEach(function (t) {
        var grid = el('div', { class: 'lib-grid' });
        groups[t].forEach(function (d) { grid.appendChild(libCard(d)); });
        body.appendChild(el('section', {}, [el('h3', { text: t + ' · ' + groups[t].length }), grid]));
      });
    }).catch(function (e) { fail(e, 'Could not read the library: '); });
  }

  function libCard(d) {
    var a = acFor(d);
    var col = colors();
    var sess = lib.sessions[d.id] || [];
    var scenes = SK.scenesOf(sess);
    var recorded = sess.reduce(function (n, s) { return n + (s.duration || 0); }, 0);
    var tagged = d.items.filter(function (it) { return it.meta; }).length;
    var pic = SK.picture(d.items, SK.itemsBounds(d.items, a), 220, 140, { ac: a, ink: col.ink, paper: col.paper });
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
      el('span', { class: 'meta', text: scenes.length + (scenes.length === 1 ? ' scene' : ' scenes') + ' · ' +
        sess.length + (sess.length === 1 ? ' recording' : ' recordings') + ' · ' + SK.formatTime(recorded) + ' · ' +
        d.items.length + ' elements (' + tagged + ' tagged)' }),
      el('span', { class: 'tags-line', text: detailTags(d).join(' · ') || 'no tags yet' }),
      el('p', { class: 'said', text: last ? SK.firstWords(last, 10) : 'No words recorded yet.' })
    ]);
    bindFlip(card, pic, d);
    card.addEventListener('click', function () {
      if (Date.now() < card._quietUntil) return;
      closeLibrary();
      if (d.id !== detail.id) openDetail(d);
    });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); card.click(); }
    });
    return card;
  }

  function removeDetail(d) {
    if (d.id === detail.id) { closeLibrary(); deleteDetail(); return; }
    if (!window.confirm('Delete "' + d.name + '" and its recordings from this browser? This cannot be undone.')) return;
    SK.DB.sessionsOf(d.id)
      .then(function (list) { return Promise.all(list.map(function (s) { return SK.DB.del('sessions', s.id); })); })
      .then(function () { return SK.DB.del('details', d.id); })
      .then(function () { toast('Deleted ' + d.name + '.'); renderLibrary(); })
      .catch(function (e) { fail(e, 'Could not delete: '); });
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
    if (!SK.Cloud.ready()) {
      body.appendChild(el('p', { class: 'muted', text: 'The cloud library did not load. Check the connection. Drawings still save on this device.' }));
      return;
    }
    SK.Cloud.session().then(function (s) {
      if (!s) { body.appendChild(signInForm()); return; }
      return SK.Cloud.details().then(function (list) {
        body.appendChild(el('div', { class: 'row' }, [
          el('span', { class: 'muted', text: 'Signed in. Collections are the tags on each detail.' }),
          el('button', { class: 'btn small', text: 'Sign out', on: { click: function () { SK.Cloud.signOut().then(renderCloud); } } })
        ]));
        if (!list.length) {
          body.appendChild(el('p', { class: 'muted', text: 'Nothing uploaded yet. Open a detail, then Project info → Upload to cloud.' }));
          return;
        }
        var groups = {};
        list.forEach(function (d) {
          (d.tags && d.tags.length ? d.tags : ['untagged']).forEach(function (t) { (groups[t] = groups[t] || []).push(d); });
        });
        Object.keys(groups).sort(function (a, b) {
          if (a === 'untagged') return 1;
          if (b === 'untagged') return -1;
          return a.localeCompare(b);
        }).forEach(function (t) {
          var grid = el('div', { class: 'lib-grid' });
          groups[t].forEach(function (d) {
            grid.appendChild(el('article', { class: 'lib-card', role: 'button', tabindex: '0', on: {
              click: function () { renderCloudDetail(d); },
              keydown: function (e) { if (e.key === 'Enter') renderCloudDetail(d); }
            } }, [
              el('b', { text: d.name }),
              el('span', { class: 'muted', text: SK.scaleOf(d.scale).label + (d.parent_id ? ' · branch' : '') }),
              el('span', { class: 'tags-line', text: (d.tags || []).join(' · ') || 'no tags' }),
              el('span', { class: 'meta', text: 'Updated ' + new Date(d.updated_at).toLocaleString() })
            ]));
          });
          body.appendChild(el('section', {}, [el('h3', { text: t + ' · ' + groups[t].length }), grid]));
        });
      });
    }).catch(function (e) {
      fail(e, 'Could not reach the cloud: ');
      body.appendChild(el('p', { class: 'muted', text: 'Try again in a moment. Your drawings still save on this device.' }));
    });
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
      var s = sessions.filter(function (x) { return x.id === f.sessionId; })[0];
      if (f.kind === 'audio') { media[f.path] = s.audio; return; }
      var sc = an.scenes.filter(function (x) { return x.sessionId === f.sessionId && x.index === f.sceneIndex; })[0];
      var items = SK.stateAt(s, sc.end);
      var b = SK.itemsBounds(items, ac()) || SK.itemsBounds(detail.items, ac());
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
  function framesFor(d) {
    if (lib.frames[d.id]) return Promise.resolve(lib.frames[d.id]);
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
    var col = colors();
    var b = SK.itemsBounds(all, a) || SK.itemsBounds(d.items, a);
    var frames = SK.scenesOf(sess).map(function (sc) {
      return {
        canvas: SK.picture(SK.stateAt(byId[sc.sessionId], sc.end), b, 220, 140, { ac: a, ink: col.ink, paper: col.paper }),
        label: 'Scene ' + sc.index + ' · ' + SK.formatTime(sc.start)
      };
    });
    lib.frames[d.id] = frames;
    return Promise.resolve(frames);
  }

  // Hold a card to flip through its scenes like a flip book. Release to see the detail as it is now.
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
      el('li', {}, [el('b', { text: 'v3 · current' }), el('span', { text: 'Endless sheet, scenes, notes, dimensions, library' })]),
      el('li', {}, [el('a', { href: 'history/v2/index.html', text: 'v2 · Wall sketch' }), el('span', { text: 'Blank sheet with recording and replay' })]),
      el('li', {}, [el('a', { href: 'history/v1/index.html', text: 'v1 · Quick Detail' }), el('span', { text: 'Detail editor with tools, meaning and exports' })])
    ]);

    [
      section('Notes', [el('label', { class: 'check' }, [caps, ' Write notes in capitals'])]),
      section('Dimensions', [el('label', { class: 'check' }, ['Round to ', round])]),
      section('Version log', [versions, el('p', { class: 'muted', text: 'Earlier versions keep their own saved work.' })]),
      section('Keys', [el('p', { class: 'muted small', text: 'T text · D dimension · N new scene · F fit · Ctrl+Z undo · Delete removes the selection · Esc cancels · Space+drag or right-drag pans · Ctrl+wheel or pinch zooms' })]),
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

  function deleteDetail() {
    if (!window.confirm('Delete "' + detail.name + '" and all its recordings? This cannot be undone.')) return;
    var gone = detail;
    stopRecording().then(function () {
      return Promise.all(sessions.map(function (s) { return SK.DB.del('sessions', s.id); }));
    }).then(function () { return SK.DB.del('details', gone.id); })
      .then(function () { return SK.DB.all('details'); })
      .then(function (list) {
        closePanel();
        list.sort(function (a, b) { return b.modified - a.modified; });
        var next = list[0] || newDetail();
        if (!list[0]) SK.DB.put('details', next);
        return openDetail(next);
      }).catch(fail);
  }

  // ---- log: a film strip of every scene ----

  function sessionBounds(s) {
    var items = s.base.slice();
    s.events.forEach(function (ev) {
      if (ev.type === 'put') items.push(ev.item);
      else if (ev.type === 'replace') items = items.concat(ev.items);
    });
    return SK.itemsBounds(items, acFor(detail, s.scale));
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
          thumb.appendChild(SK.picture(SK.stateAt(s, m.end), b, 200, 130, { ac: acFor(detail, s.scale), ink: col.ink, paper: col.paper }));
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
  function sheetCanvas(items, b, d) {
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
    SK.paint(c, items, v, { ac: acFor(d), ink: '#000', paper: '#fff', w: w, h: h });
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

  function exportJpeg() {
    var b = SK.itemsBounds(detail.items, ac());
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
    var b = SK.boundsOf(pts) || SK.itemsBounds(detail.items, ac());
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

  // ===================================================================
  // Rail, scene button, keys
  // ===================================================================

  $('rail').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act');
    if (act === 'scene') return;
    if (act === 'undo') undo();
    else if (act === 'text' || act === 'dim') { if (pb) exitReplay(); setTool(act); }
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
  $('libSearch').addEventListener('input', function (e) { lib.query = e.target.value; renderLibrary(); });
  document.querySelectorAll('#libViews [data-view]').forEach(function (b) {
    b.addEventListener('click', function () { lib.view = b.getAttribute('data-view'); renderLibrary(); });
  });
  $('libNew').addEventListener('click', function () {
    var d = newDetail();
    SK.DB.put('details', d).then(function () { closeLibrary(); openDetail(d); });
  });
  $('panelClose').addEventListener('click', closePanel);
  $('logClose').addEventListener('click', closePanel);

  document.addEventListener('keydown', function (e) {
    var tag = e.target && e.target.tagName;
    var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.key === 'Escape') {
      if (!$('libPage').hidden) closeLibrary();
      else if (draft) endDraft();
      else if (sel) select(null);
      else if (panelKind) closePanel();
      else if (pb) exitReplay();
      return;
    }
    if (typing) return;
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
      if (r[1]) customTags = r[1];
      var list = r[3].sort(function (a, b) { return b.modified - a.modified; });
      var d = list.filter(function (x) { return x.id === r[2]; })[0] || list[0];
      if (!d) { d = newDetail(); SK.DB.put('details', d); }
      resize();
      return openDetail(d);
    })
    .catch(function (e) {
      fail(e, 'Storage is unavailable, so nothing will be kept: ');
      detail = newDetail();
      resize();
    });

  // For the browser test.
  window.__sketch = { state: function () { return { detail: detail, sessions: sessions, take: take, view: view, sel: sel, pb: pb }; }, stopRecording: stopRecording };
})();
