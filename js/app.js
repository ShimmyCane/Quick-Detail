// Quick Detail — editor: state, drawing tools, selection, panels, settings, exports.
(function (QD) {
  'use strict';

  var G = QD.G, M = QD.M, P = QD.P, S = QD.S, X = QD.X, R = QD.R;
  var $ = function (id) { return document.getElementById(id); };

  // ===================================================================
  // 1. Storage, settings, state
  // ===================================================================

  function lsGet(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { logError('Could not save to browser storage: ' + e.message); return false; }
  }

  var DEFAULT_SETTINGS = {
    pens: {},
    textMM: 2.5,
    gridIn: 0.25,
    gridMM: 5,
    gridSnap: true,
    objectSnap: true,
    showGrid: true,
    minScreenPx: 0.75,
    showErrors: false,
    dpi: 300
  };
  QD.PENS.forEach(function (p) { DEFAULT_SETTINGS.pens[p.id] = p.mm; });

  var settings = Object.assign(M.clone(DEFAULT_SETTINGS), lsGet('qd.settings', {}));
  settings.pens = Object.assign(M.clone(DEFAULT_SETTINGS.pens), settings.pens || {});

  var st = {
    detail: null,
    sel: [],
    tool: 'select',
    pen: 'P3',
    linetype: 'continuous',
    material: '',
    hatch: 'none',
    draft: null,          // { tool, pts, target }
    cursor: null,         // raw world point under the pointer
    snap: null,           // { p, kind }
    view: { cx: 0, cy: 0, s: 20 },   // s = screen px per drawing unit
    drag: null,
    pickRel: null,        // { type, from } waiting for a target tap
    undo: [],
    redo: [],
    prims: {},            // element id -> primitives (for hit testing)
    findings: null,
    shift: false,
    dirty: false
  };

  // ===================================================================
  // 2. Errors and toast
  // ===================================================================

  var errors = [];
  function logError(msg) {
    errors.push(new Date().toLocaleTimeString() + '  ' + msg);
    renderErrors();
  }
  function renderErrors() {
    var panel = $('errorPanel');
    if (!panel) return;
    panel.hidden = !settings.showErrors;
    $('errorList').innerHTML = errors.length ? errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') : '<li class="muted">No errors.</li>';
  }
  window.addEventListener('error', function (e) { logError(e.message + (e.filename ? ' (' + e.filename.split('/').pop() + ':' + e.lineno + ')' : '')); });
  window.addEventListener('unhandledrejection', function (e) { logError('Async: ' + (e.reason && e.reason.message || e.reason)); });

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // ===================================================================
  // 3. Tools
  // ===================================================================

  var TOOLS = [
    { id: 'select', label: 'Select', key: 'v', icon: '<path d="M5 3l13 9.5-6.2.8 3.4 6.8-2.8 1.4-3.4-6.9L5 19z"/>' },
    { id: 'line', label: 'Line', key: 'l', icon: '<path d="M4 20L20 4"/><circle cx="4" cy="20" r="1.5"/><circle cx="20" cy="4" r="1.5"/>' },
    { id: 'polyline', label: 'Polyline', key: 'p', icon: '<path d="M3 19L9 8l6 7 6-11"/>' },
    { id: 'rect', label: 'Rectangle', key: 'r', icon: '<path d="M4 6h16v12H4z"/>' },
    { id: 'region', label: 'Region', key: 'g', icon: '<path d="M4 5h16v14H4z"/><path d="M4 12l7-7M4 19l14-14M11 19l9-9"/>' },
    { id: 'circle', label: 'Circle', key: 'c', icon: '<circle cx="12" cy="12" r="8"/>' },
    { id: 'arc', label: 'Arc', key: 'a', icon: '<path d="M4 18A10 10 0 0 1 20 9"/>' },
    { id: 'text', label: 'Text', key: 't', icon: '<path d="M5 6h14M12 6v13"/>' },
    { id: 'leader', label: 'Leader', key: 'e', icon: '<path d="M21 6h-7L5 18"/><path d="M5 18l1.2-5M5 18l4.6-2.2"/>' },
    { id: 'dimension', label: 'Dimension', key: 'm', icon: '<path d="M3 13h18M3 8v10M21 8v10M1.5 15l3-4M19.5 15l3-4"/>' },
    { id: 'breakline', label: 'Break', key: 'b', icon: '<path d="M2 12h7l1.5-5 3 10 1.5-5h7"/>' }
  ];

  var HINTS = {
    select: 'Tap to select. Drag to move. Drag a blue square to move one point. Drag empty space to pan.',
    line: ['Tap the start point.', 'Tap the end point.'],
    polyline: ['Tap the first point.', 'Keep tapping points. Finish (Enter or double-tap), or tap the first point to close.'],
    rect: ['Tap one corner.', 'Tap the opposite corner.'],
    region: ['Tap the first corner of the region.', 'Keep tapping corners, then Finish. The region takes the current hatch.'],
    circle: ['Tap the center.', 'Tap a point on the circle.'],
    arc: ['Tap the center.', 'Tap the start of the arc.', 'Tap the end (the arc runs counter-clockwise).'],
    text: ['Tap where the note starts.'],
    leader: ['Tap the arrow tip ON the line or region the note describes.', 'Tap bend points, then Finish where the note goes.'],
    dimension: ['Tap the first point to measure.', 'Tap the second point.', 'Tap where the dimension line goes.'],
    breakline: ['Tap the start of the break line.', 'Tap the end.']
  };

  var TWO_POINT = { line: 1, rect: 1, circle: 1, breakline: 1 };
  var MULTI_POINT = { polyline: 1, region: 1, leader: 1 };

  // ===================================================================
  // 4. History and mutation
  // ===================================================================

  function locked() { return st.detail.status === 'locked'; }

  function pushHistory() {
    st.undo.push(JSON.stringify(st.detail));
    if (st.undo.length > 200) st.undo.shift();
    st.redo = [];
  }

  function touch() {
    st.detail.modified = new Date().toISOString();
    st.dirty = true;
    lsSet('qd.current', st.detail);
  }

  // Every edit goes through here: lock check, undo snapshot, autosave, redraw.
  function mutate(fn, opts) {
    if (locked() && !(opts && opts.allowLocked)) {
      toast('This detail is locked. Set its status back to draft in the Detail panel to edit it.');
      renderPanels();
      return false;
    }
    pushHistory();
    try { fn(); }
    catch (e) { logError('Edit failed: ' + e.message); }
    touch();
    renderAll();
    return true;
  }

  function undo() {
    if (!st.undo.length) return;
    st.redo.push(JSON.stringify(st.detail));
    st.detail = JSON.parse(st.undo.pop());
    afterHistoryJump();
  }
  function redo() {
    if (!st.redo.length) return;
    st.undo.push(JSON.stringify(st.detail));
    st.detail = JSON.parse(st.redo.pop());
    afterHistoryJump();
  }
  function afterHistoryJump() {
    st.sel = st.sel.filter(function (id) { return M.byId(st.detail, id); });
    st.draft = null;
    touch();
    renderAll();
  }

  function loadDetail(d, opts) {
    st.detail = M.normalize(d);
    st.sel = [];
    st.draft = null;
    st.findings = null;
    st.pickRel = null;
    if (!(opts && opts.keepHistory)) { st.undo = []; st.redo = []; }
    st.dirty = !!(opts && opts.dirty);
    lsSet('qd.current', st.detail);
    renderAll();
    fit();
  }

  // ===================================================================
  // 5. View and coordinates
  // ===================================================================

  var svg, gGrid, gDraw, gSel, gDraft, gHandles, gSnap;

  function px(n) { return n / st.view.s; }

  function viewBox() {
    var r = svg.getBoundingClientRect();
    var s = st.view.s;
    return { x: st.view.cx - r.width / 2 / s, y: -st.view.cy - r.height / 2 / s, w: r.width / s, h: r.height / s, W: r.width, H: r.height, left: r.left, top: r.top };
  }

  function toWorld(clientX, clientY) {
    var vb = viewBox();
    return [vb.x + (clientX - vb.left) / st.view.s, -(vb.y + (clientY - vb.top) / st.view.s)];
  }

  function applyView() {
    var vb = viewBox();
    if (!(vb.w > 0) || !(vb.h > 0)) return;
    svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h);
    renderGrid(vb);
  }

  function zoomAt(factor, clientX, clientY) {
    var vb = viewBox();
    var w = toWorld(clientX, clientY);
    var s = Math.max(0.5, Math.min(4000, st.view.s * factor));
    st.view.s = s;
    st.view.cx = w[0] - (clientX - vb.left - vb.W / 2) / s;
    st.view.cy = w[1] + (clientY - vb.top - vb.H / 2) / s;
    applyView();
    renderDrawing();
    renderOverlay();
  }

  function fit() {
    var vb = viewBox();
    if (!(vb.W > 0)) return;
    var prims = [];
    Object.keys(st.prims).forEach(function (k) { prims = prims.concat(st.prims[k]); });
    var b = prims.length ? P.primBounds(prims) : (st.detail.units === 'in' ? { minx: 0, miny: 0, maxx: 36, maxy: 24 } : { minx: 0, miny: 0, maxx: 900, maxy: 600 });
    var bw = Math.max(b.maxx - b.minx, 1e-3), bh = Math.max(b.maxy - b.miny, 1e-3);
    st.view.s = Math.min(vb.W / (bw * 1.15), vb.H / (bh * 1.2));
    st.view.cx = (b.minx + b.maxx) / 2;
    st.view.cy = (b.miny + b.maxy) / 2;
    applyView();
    renderDrawing();
    renderOverlay();
  }

  function gridSize() { return st.detail.units === 'in' ? settings.gridIn : settings.gridMM; }

  // ===================================================================
  // 6. Rendering
  // ===================================================================

  function renderGrid(vb) {
    if (!settings.showGrid) { gGrid.innerHTML = ''; return; }
    var g = gridSize();
    var major = st.detail.units === 'in' ? 12 : 100;
    while (g * st.view.s < 9) g *= 4;
    if (major * st.view.s < 24) major = g * 4;
    function lines(step, cap) {
      var d = '';
      var x0 = Math.floor(vb.x / step) * step, y0 = Math.floor(vb.y / step) * step;
      var count = 0;
      for (var x = x0; x <= vb.x + vb.w && count < cap; x += step, count++) d += 'M' + x + ' ' + vb.y + 'V' + (vb.y + vb.h);
      for (var y = y0; y <= vb.y + vb.h && count < cap * 2; y += step, count++) d += 'M' + vb.x + ' ' + y + 'H' + (vb.x + vb.w);
      return d;
    }
    gGrid.innerHTML =
      '<path d="' + lines(g, 600) + '" stroke="#eef1f6" stroke-width="1" vector-effect="non-scaling-stroke" fill="none"/>' +
      '<path d="' + lines(major, 300) + '" stroke="#dce3ec" stroke-width="1" vector-effect="non-scaling-stroke" fill="none"/>' +
      '<path d="M' + vb.x + ' 0H' + (vb.x + vb.w) + 'M0 ' + vb.y + 'V' + (vb.y + vb.h) + '" stroke="#c9d6e6" stroke-width="1" vector-effect="non-scaling-stroke" fill="none"/>';
  }

  function renderDrawing() {
    var cx = P.ctx(st.detail, settings);
    st.prims = {};
    var all = [];
    st.detail.elements.forEach(function (el) {
      try {
        var pr = P.element(cx, el);
        st.prims[el.id] = pr;
        all = all.concat(pr);
      } catch (e) { logError('Could not draw ' + el.id + ': ' + e.message); }
    });
    gDraw.innerHTML = S.prims(all, cx, { minStroke: px(settings.minScreenPx) });
  }

  function draftElement() {
    var d = st.draft;
    if (!d) return null;
    var pts = d.pts.slice();
    if (st.snap) pts.push(st.snap.p);
    var t = d.tool;
    var gr = { pen: penFor(t), linetype: st.linetype };
    var el = { id: '_draft', graphics: gr, geometry: null };
    if (pts.length < 2) return null;
    try {
      if (t === 'line' || t === 'polyline' || t === 'breakline') el.geometry = { type: t === 'breakline' ? 'breakline' : 'polyline', points: pts.slice(0, t === 'polyline' ? pts.length : 2) };
      else if (t === 'rect') el.geometry = { type: 'polyline', points: rectPts(pts[0], pts[1]), closed: true };
      else if (t === 'region') el.geometry = { type: 'polyline', points: pts, closed: pts.length > 2 };
      else if (t === 'circle') el.geometry = { type: 'circle', center: pts[0], radius: Math.max(G.dist(pts[0], pts[1]), 1e-6) };
      else if (t === 'arc') {
        if (pts.length === 2) el.geometry = { type: 'polyline', points: pts };
        else el.geometry = { type: 'arc', center: pts[0], radius: Math.max(G.dist(pts[0], pts[1]), 1e-6), start: G.angleDeg(pts[0], pts[1]), end: G.angleDeg(pts[0], pts[2]) };
      } else if (t === 'leader') el.geometry = { type: 'leader', points: pts.slice().reverse() };
      else if (t === 'dimension') {
        if (pts.length === 2) el.geometry = { type: 'dimension', points: pts, offset: 0 };
        else el.geometry = { type: 'dimension', points: [pts[0], pts[1]], offset: perpOffset(pts[0], pts[1], pts[2]) };
      }
    } catch (e) { return null; }
    return el.geometry ? el : null;
  }

  function renderOverlay() {
    var cx = P.ctx(st.detail, settings);
    // Selection highlight
    var selPrims = [];
    st.sel.forEach(function (id) { if (st.prims[id]) selPrims = selPrims.concat(st.prims[id]); });
    gSel.innerHTML = S.prims(selPrims, cx, { minStroke: px(2) });
    // Handles for a single selection
    var hs = '';
    if (st.sel.length === 1 && st.tool === 'select') {
      var el = M.byId(st.detail, st.sel[0]);
      if (el) M.points(el).forEach(function (p) {
        var r = px(5);
        hs += '<rect class="handle" x="' + (p[0] - r) + '" y="' + (-p[1] - r) + '" width="' + 2 * r + '" height="' + 2 * r + '" stroke-width="' + px(2) + '"/>';
      });
    }
    gHandles.innerHTML = hs;
    // Draft preview
    var dEl = draftElement();
    var dHtml = dEl ? S.prims(P.element(cx, dEl), cx, { minStroke: px(1.5) }) : '';
    if (st.draft) st.draft.pts.forEach(function (p) {
      dHtml += '<circle cx="' + p[0] + '" cy="' + (-p[1]) + '" r="' + px(3.5) + '" fill="#e8684a" stroke="none"/>';
    });
    gDraft.innerHTML = dHtml;
    // Snap marker
    var sn = '';
    if (st.snap && st.tool !== 'select') {
      var p = st.snap.p, r2 = px(6);
      if (st.snap.kind === 'end') sn = '<rect class="snapmark" x="' + (p[0] - r2) + '" y="' + (-p[1] - r2) + '" width="' + 2 * r2 + '" height="' + 2 * r2 + '" stroke-width="' + px(2) + '"/>';
      else if (st.snap.kind === 'mid') sn = '<path class="snapmark" d="M' + (p[0] - r2) + ' ' + (-p[1] + r2) + 'L' + p[0] + ' ' + (-p[1] - r2) + 'L' + (p[0] + r2) + ' ' + (-p[1] + r2) + 'Z" stroke-width="' + px(2) + '"/>';
      else if (st.snap.kind === 'near') sn = '<path class="snapmark" d="M' + (p[0] - r2) + ' ' + (-p[1] - r2) + 'L' + (p[0] + r2) + ' ' + (-p[1] + r2) + 'M' + (p[0] + r2) + ' ' + (-p[1] - r2) + 'L' + (p[0] - r2) + ' ' + (-p[1] + r2) + '" stroke-width="' + px(2) + '"/>';
      else sn = '<circle class="snapmark" cx="' + p[0] + '" cy="' + (-p[1]) + '" r="' + px(3) + '" stroke-width="' + px(1.5) + '"/>';
    }
    gSnap.innerHTML = sn;
    renderReadout();
    renderHint();
  }

  function renderReadout() {
    var p = st.snap ? st.snap.p : st.cursor;
    var u = st.detail.units;
    function f(v) { return u === 'in' ? G.formatLength(v, 'in') : (Math.round(v * 10) / 10) + ''; }
    var txt = p ? 'x ' + f(p[0]) + '   y ' + f(p[1]) : '—';
    if (st.draft && st.draft.pts.length && p) {
      var last = st.draft.pts[st.draft.pts.length - 1];
      txt += '   len ' + f(G.dist(last, p)) + '  ∠ ' + Math.round(G.angleDeg(last, p) * 10) / 10 + '°';
    }
    if (st.snap && st.snap.kind !== 'grid' && st.snap.kind !== 'none') txt += '   [' + st.snap.kind + ']';
    $('readout').textContent = txt;
  }

  function renderHint() {
    var h = HINTS[st.tool];
    var step = st.draft ? st.draft.pts.length : 0;
    var text = Array.isArray(h) ? h[Math.min(step, h.length - 1)] : h;
    if (st.pickRel) text = 'Tap the element that ' + st.pickRel.from + ' ' + QD.humanize(st.pickRel.type) + '. Esc cancels.';
    if (locked()) text = 'Locked detail: view only. ' + (st.tool === 'select' ? '' : 'Drawing is disabled.');
    $('hintText').textContent = text;
    var drawing = st.tool !== 'select' && st.tool !== 'text' && !locked();
    $('coordInput').hidden = !drawing;
    $('finishBtn').hidden = !(st.draft && MULTI_POINT[st.draft.tool]);
    $('cancelBtn').hidden = !(st.draft || st.pickRel);
  }

  function renderTop() {
    var d = st.detail;
    $('docTitle').textContent = d.title;
    $('docScale').textContent = d.scale + ' · ' + d.units;
    var s = $('docStatus');
    s.textContent = d.status;
    s.className = 'chip ' + d.status;
    document.title = d.title + ' · Quick Detail';
    $('undoBtn').disabled = !st.undo.length;
    $('redoBtn').disabled = !st.redo.length;
  }

  function renderAll() {
    renderTop();
    applyView();
    renderDrawing();
    renderOverlay();
    renderToolbar();
    renderPanels();
    renderErrors();
  }

  // ===================================================================
  // 7. Hit testing and snapping
  // ===================================================================

  function primHit(pr, p, tol) {
    if (pr.kind === 'path') {
      if (pr.fillOnly) return pr.closed && G.pointInPoly(p, pr.pts) ? 0 : Infinity;
      return G.distToPolyline(p, pr.pts, pr.closed);
    }
    if (pr.kind === 'circle') {
      var d = G.dist(p, pr.c);
      return pr.fill != null ? Math.max(0, d - pr.r) : Math.abs(d - pr.r);
    }
    if (pr.kind === 'arc') return G.distToPolyline(p, G.arcPoints(pr.c, pr.r, pr.a0, pr.a1));
    if (pr.kind === 'text') {
      var q = G.rotate(p, -pr.rot, pr.at);
      var w = G.textWidth(pr.str, pr.h);
      var x0 = pr.at[0] + (pr.anchor === 'middle' ? -w / 2 : pr.anchor === 'end' ? -w : 0);
      var inside = q[0] >= x0 - tol && q[0] <= x0 + w + tol && q[1] >= pr.at[1] - pr.h * 0.3 - tol && q[1] <= pr.at[1] + pr.h + tol;
      return inside ? 0 : Infinity;
    }
    return Infinity;
  }

  // Topmost element under p: linework and notes first, then region interiors.
  function hitTest(p, exclude) {
    var tol = px(8);
    var els = st.detail.elements;
    var best = null, bestD = Infinity;
    for (var i = els.length - 1; i >= 0; i--) {
      var el = els[i];
      if (exclude && exclude.indexOf(el.id) >= 0) continue;
      var prs = st.prims[el.id] || [];
      for (var k = 0; k < prs.length; k++) {
        if (/-HATCH$/.test(prs[k].layer)) continue;
        var d = primHit(prs[k], p, tol);
        if (d <= tol && d < bestD - 1e-9) { best = el.id; bestD = d; }
      }
    }
    if (best) return best;
    for (var j = els.length - 1; j >= 0; j--) {
      var e2 = els[j];
      if (exclude && exclude.indexOf(e2.id) >= 0) continue;
      if (e2.geometry.type === 'region' && G.pointInPoly(p, e2.geometry.points)) return e2.id;
    }
    return null;
  }

  function nearestOn(el, p) {
    var best = null, bestD = Infinity;
    var g = el.geometry;
    var segsOf = [];
    if (g.points) {
      var pts = g.points;
      for (var i = 0; i < pts.length - 1; i++) segsOf.push([pts[i], pts[i + 1]]);
      if ((g.type === 'region' || g.closed) && pts.length > 2) segsOf.push([pts[pts.length - 1], pts[0]]);
    } else if (g.type === 'circle' || g.type === 'arc') {
      var ap = g.type === 'circle' ? G.arcPoints(g.center, g.radius, 0, 360, 72) : G.arcPoints(g.center, g.radius, g.start, g.end);
      for (var k = 0; k < ap.length - 1; k++) segsOf.push([ap[k], ap[k + 1]]);
    }
    // Inside a region, the tap point itself is a fine arrow tip.
    if (g.type === 'region' && G.pointInPoly(p, g.points)) return p.slice();
    segsOf.forEach(function (s) {
      var a = s[0], b = s[1];
      var dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      var t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
      var q = [a[0] + t * dx, a[1] + t * dy];
      var d = G.dist(p, q);
      if (d < bestD) { bestD = d; best = q; }
    });
    return best || p.slice();
  }

  function snapPoint(raw, opts) {
    opts = opts || {};
    var tol = px(11);
    var best = null, bestD = tol;
    if (settings.objectSnap) {
      st.detail.elements.forEach(function (el) {
        if (opts.exclude && opts.exclude.indexOf(el.id) >= 0) return;
        var g = el.geometry;
        if (g.type === 'text') return;
        var pts = M.points(el);
        pts.forEach(function (q) { var d = G.dist(raw, q); if (d < bestD) { bestD = d; best = { p: q.slice(), kind: 'end' }; } });
        if (g.points && (g.type === 'line' || g.type === 'polyline' || g.type === 'region')) {
          var n = g.points.length;
          var closed = g.type === 'region' || g.closed;
          for (var i = 0; i < (closed ? n : n - 1); i++) {
            var a = g.points[i], b = g.points[(i + 1) % n];
            var m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            var d2 = G.dist(raw, m);
            if (d2 < bestD) { bestD = d2; best = { p: m, kind: 'mid' }; }
          }
        }
        if (g.type === 'arc') {
          [g.start, g.end].forEach(function (a) {
            var q = [g.center[0] + g.radius * Math.cos(a * Math.PI / 180), g.center[1] + g.radius * Math.sin(a * Math.PI / 180)];
            var d3 = G.dist(raw, q);
            if (d3 < bestD) { bestD = d3; best = { p: q, kind: 'end' }; }
          });
        }
      });
      // Draft's own first point (to close a polyline).
      if (st.draft && st.draft.pts.length > 2) {
        var f = st.draft.pts[0];
        if (G.dist(raw, f) < bestD) { bestD = G.dist(raw, f); best = { p: f.slice(), kind: 'end' }; }
      }
    }
    if (!best && opts.nearest) {
      var hit = hitTest(raw);
      if (hit) best = { p: nearestOn(M.byId(st.detail, hit), raw), kind: 'near' };
    }
    if (!best) {
      if (settings.gridSnap && !opts.noGrid) {
        var g2 = gridSize();
        best = { p: [Math.round(raw[0] / g2) * g2, Math.round(raw[1] / g2) * g2], kind: 'grid' };
      } else best = { p: raw.slice(), kind: 'none' };
    }
    // Shift: keep the segment horizontal or vertical.
    if (st.shift && st.draft && st.draft.pts.length && best.kind !== 'end') {
      var last = st.draft.pts[st.draft.pts.length - 1];
      if (Math.abs(best.p[0] - last[0]) > Math.abs(best.p[1] - last[1])) best.p[1] = last[1];
      else best.p[0] = last[0];
    }
    return best;
  }

  // ===================================================================
  // 8. Pointer input
  // ===================================================================

  var pointers = new Map();
  var pinch = null;
  var spaceDown = false;

  function onPointerDown(e) {
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      // Two fingers: pinch zoom and pan; drop any single-pointer action.
      var pts = Array.from(pointers.values());
      var vb = viewBox();
      var mid = [(pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2];
      pinch = { d0: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), s0: st.view.s, w0: toWorld(mid[0], mid[1]), vb: vb };
      if (st.drag && st.drag.moved && (st.drag.mode === 'move' || st.drag.mode === 'vertex')) undoSilently();
      st.drag = null;
      return;
    }
    if (pointers.size > 2) return;
    var raw = toWorld(e.clientX, e.clientY);
    st.cursor = raw;

    if (e.button === 1 || spaceDown) { startPan(e); return; }
    if (e.button === 2) return;

    if (st.pickRel) { completePickRel(raw); return; }

    if (st.tool === 'select' || locked()) { selectDown(e, raw); return; }

    var sn = snapPoint(raw, { nearest: st.tool === 'leader' && !st.draft });
    st.snap = sn;
    addDraftPoint(sn.p, raw);
  }

  function undoSilently() {
    if (!st.undo.length) return;
    st.detail = JSON.parse(st.undo.pop());
    renderAll();
  }

  function startPan(e) {
    st.drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, cx: st.view.cx, cy: st.view.cy };
    svg.classList.add('panning');
  }

  function selectDown(e, raw) {
    // Vertex handle of the single selection?
    if (st.sel.length === 1 && !locked()) {
      var el = M.byId(st.detail, st.sel[0]);
      var pts = el ? M.points(el) : [];
      for (var i = 0; i < pts.length; i++) {
        if (G.dist(raw, pts[i]) <= px(10)) {
          st.drag = { mode: 'vertex', id: el.id, idx: i, moved: false };
          return;
        }
      }
    }
    var id = hitTest(raw);
    if (id) {
      if (e.shiftKey) {
        var at = st.sel.indexOf(id);
        if (at >= 0) st.sel.splice(at, 1); else st.sel.push(id);
      } else if (st.sel.indexOf(id) < 0) st.sel = [id];
      st.drag = locked() ? null : { mode: 'move', start: raw, applied: [0, 0], moved: false };
      renderOverlay();
      renderPanels();
      return;
    }
    if (!e.shiftKey && st.sel.length) { st.sel = []; renderOverlay(); renderPanels(); }
    startPan(e);
  }

  function onPointerMove(e) {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      var pts = Array.from(pointers.values());
      var d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      var mid = [(pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2];
      var vb = pinch.vb;
      st.view.s = Math.max(0.5, Math.min(4000, pinch.s0 * d / Math.max(pinch.d0, 1)));
      st.view.cx = pinch.w0[0] - (mid[0] - vb.left - vb.W / 2) / st.view.s;
      st.view.cy = pinch.w0[1] + (mid[1] - vb.top - vb.H / 2) / st.view.s;
      applyView();
      renderDrawing();
      renderOverlay();
      return;
    }
    var raw = toWorld(e.clientX, e.clientY);
    st.cursor = raw;
    var dr = st.drag;
    if (dr && dr.mode === 'pan') {
      st.view.cx = dr.cx - (e.clientX - dr.sx) / st.view.s;
      st.view.cy = dr.cy + (e.clientY - dr.sy) / st.view.s;
      applyView();
      return;
    }
    if (dr && dr.mode === 'move') {
      var dx = raw[0] - dr.start[0], dy = raw[1] - dr.start[1];
      if (settings.gridSnap) { var g = gridSize(); dx = Math.round(dx / g) * g; dy = Math.round(dy / g) * g; }
      if (!dr.moved && (Math.abs(dx) > 0 || Math.abs(dy) > 0)) { pushHistory(); dr.moved = true; }
      if (dr.moved) {
        var ddx = dx - dr.applied[0], ddy = dy - dr.applied[1];
        if (ddx || ddy) {
          st.sel.forEach(function (id) { var el = M.byId(st.detail, id); if (el) M.translate(el, ddx, ddy); });
          dr.applied = [dx, dy];
          renderDrawing();
          renderOverlay();
        }
      }
      return;
    }
    if (dr && dr.mode === 'vertex') {
      var sn = snapPoint(raw, { exclude: [dr.id] });
      var el = M.byId(st.detail, dr.id);
      var p = M.points(el)[dr.idx];
      if (p[0] !== sn.p[0] || p[1] !== sn.p[1]) {
        if (!dr.moved) { pushHistory(); dr.moved = true; }
        p[0] = sn.p[0]; p[1] = sn.p[1];
        st.snap = sn;
        renderDrawing();
        renderOverlay();
      }
      return;
    }
    if (st.tool !== 'select' && !locked()) {
      st.snap = snapPoint(raw, { nearest: st.tool === 'leader' && !st.draft });
    } else st.snap = null;
    renderOverlay();
  }

  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    var dr = st.drag;
    st.drag = null;
    svg.classList.remove('panning');
    if (dr && (dr.mode === 'move' || dr.mode === 'vertex') && dr.moved) {
      touch();
      renderAll();
    }
  }

  function onWheel(e) {
    e.preventDefault();
    var factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016));
    zoomAt(factor, e.clientX, e.clientY);
  }

  // ===================================================================
  // 9. Drafting and element creation
  // ===================================================================

  function penFor(tool) {
    if (tool === 'leader' || tool === 'dimension' || tool === 'text') return 'P1';
    if (tool === 'breakline') return 'P2';
    return st.pen;
  }

  function rectPts(a, b) { return [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]]; }

  function perpOffset(a, b, c) {
    var L = G.dist(a, b) || 1;
    var nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
    return (c[0] - a[0]) * nx + (c[1] - a[1]) * ny;
  }

  function addDraftPoint(p, raw) {
    if (locked()) return;
    var t = st.tool;
    if (t === 'text') { createText(p); return; }
    if (!st.draft) {
      st.draft = { tool: t, pts: [p], target: null };
      if (t === 'leader') st.draft.target = hitTest(raw || p);
      renderOverlay();
      return;
    }
    var d = st.draft;
    var last = d.pts[d.pts.length - 1];
    if (G.dist(last, p) < 1e-9) {
      // A second tap on the same point finishes multi-point tools (handy on touch screens).
      if (MULTI_POINT[t]) finishDraft();
      return;
    }
    if ((t === 'polyline' || t === 'region') && d.pts.length > 2 && G.dist(p, d.pts[0]) < 1e-9) {
      d.closed = true;
      finishDraft();
      return;
    }
    d.pts.push(p);
    if ((TWO_POINT[t] && d.pts.length === 2) || ((t === 'arc' || t === 'dimension') && d.pts.length === 3)) finishDraft();
    else renderOverlay();
  }

  function cancelDraft() {
    st.draft = null;
    st.pickRel = null;
    renderOverlay();
    renderPanels();
  }

  function baseGraphics(tool) {
    var g = { pen: penFor(tool) };
    if (st.linetype !== 'continuous' && tool !== 'leader' && tool !== 'dimension' && tool !== 'breakline') g.linetype = st.linetype;
    return g;
  }

  function finishDraft() {
    var d = st.draft;
    if (!d) return;
    var pts = d.pts.filter(function (p, i) { return i === 0 || G.dist(p, d.pts[i - 1]) > 1e-9; });
    var t = d.tool;
    st.draft = null;
    var geom = null;
    if (t === 'line' && pts.length >= 2) geom = { type: 'line', points: [pts[0], pts[1]] };
    else if (t === 'polyline' && pts.length >= 2) geom = { type: 'polyline', points: pts, closed: !!d.closed && pts.length > 2 };
    else if (t === 'rect' && pts.length >= 2 && pts[0][0] !== pts[1][0] && pts[0][1] !== pts[1][1]) geom = { type: 'region', points: rectPts(pts[0], pts[1]) };
    else if (t === 'region' && pts.length >= 3) geom = { type: 'region', points: pts };
    else if (t === 'circle' && pts.length >= 2) geom = { type: 'circle', center: pts[0], radius: G.dist(pts[0], pts[1]) };
    else if (t === 'arc' && pts.length >= 3) geom = { type: 'arc', center: pts[0], radius: G.dist(pts[0], pts[1]), start: G.angleDeg(pts[0], pts[1]), end: G.angleDeg(pts[0], pts[2]) };
    else if (t === 'breakline' && pts.length >= 2) geom = { type: 'breakline', points: [pts[0], pts[1]] };
    else if (t === 'dimension' && pts.length >= 3) geom = { type: 'dimension', points: [pts[0], pts[1]], offset: perpOffset(pts[0], pts[1], pts[2]) };
    else if (t === 'leader' && pts.length >= 2) { createLeader(pts, d.target); return; }
    if (!geom) { toast('Not enough points. Nothing was added.'); renderOverlay(); return; }

    var el = { id: '', geometry: geom, graphics: baseGraphics(t), intent: [], logic: [] };
    if (geom.type === 'region') el.graphics.hatch = st.hatch;
    if (!M.isAnnotation(el) && st.material) el.meaning = M.meaningFor(st.material);
    var prefix = t === 'dimension' ? 'd' : 'e';
    mutate(function () {
      el.id = M.nextId(st.detail, prefix);
      st.detail.elements.push(el);
      st.sel = [el.id];
    });
  }

  function textHeight() { return P.ctx(st.detail, settings).mm(settings.textMM); }

  function createText(p) {
    askText('Note text', '').then(function (txt) {
      if (!txt) return;
      mutate(function () {
        var el = { id: M.nextId(st.detail, 'n'), geometry: { type: 'text', at: p.slice() }, graphics: { pen: 'P1', text: txt } };
        st.detail.elements.push(el);
        st.sel = [el.id];
      });
    });
  }

  // Leader: drawn tip-first, stored note-side first (the tip is the LAST point).
  function createLeader(pts, target) {
    var tEl = target ? M.byId(st.detail, target) : null;
    var def = '';
    if (tEl && tEl.meaning && tEl.meaning.material) {
      var m = QD.materialById(tEl.meaning.material);
      def = (m ? m.label : QD.humanize(tEl.meaning.material)).toUpperCase();
    }
    var stored = pts.slice().reverse();
    askText(tEl ? 'Note for ' + M.label(tEl) : 'Note text (leader is not touching any element)', def).then(function (txt) {
      if (txt === null) { renderOverlay(); return; }
      mutate(function () {
        var d = st.detail;
        var leader = { id: M.nextId(d, 'l'), geometry: { type: 'leader', points: stored }, graphics: { pen: 'P1', arrow: 'arrow' } };
        d.elements.push(leader);
        var noteId = null;
        if (txt) {
          var end = stored[0], prev = stored[1];
          var h = textHeight();
          var gap = P.ctx(d, settings).mm(1);
          // The note sits beyond the leader's note end: to the left if the leader runs right-to-left there.
          var leftward = prev[0] >= end[0];
          var note = {
            id: M.nextId(d, 'n'),
            geometry: { type: 'text', at: [end[0] + (leftward ? -gap : gap), end[1] - h / 2] },
            graphics: { pen: 'P1', text: txt, anchor: leftward ? 'end' : 'start' }
          };
          d.elements.push(note);
          noteId = note.id;
        }
        if (target) {
          d.relationships.push({ id: M.nextId(d, 'rel'), type: 'annotates', from: leader.id, to: target, note: noteId, source: 'architect' });
        }
        st.sel = [leader.id];
      });
      if (!target) toast('Leader added, but its tip is not on an element. Link it in Relationships.');
    });
  }

  function askText(title, initial) {
    return new Promise(function (resolve) {
      var dlg = $('textDialog');
      $('textDialogTitle').textContent = title;
      var input = $('textDialogInput');
      input.value = initial || '';
      dlg.returnValue = '';
      function done() {
        dlg.removeEventListener('close', done);
        resolve(dlg.returnValue === 'ok' ? input.value.replace(/\s+$/, '') : null);
      }
      dlg.addEventListener('close', done);
      dlg.showModal();
      input.focus();
      input.select();
    });
  }

  // Typed coordinates: "x,y" absolute, "@dx,dy" relative, "length<angle" polar from the last point.
  function onCoordInput(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    var v = e.target.value.trim();
    if (!v) { if (st.draft && MULTI_POINT[st.draft.tool]) finishDraft(); return; }
    var last = st.draft && st.draft.pts.length ? st.draft.pts[st.draft.pts.length - 1] : null;
    var p = null, m;
    if ((m = /^@?\s*(-?[\d.]+)\s*<\s*(-?[\d.]+)$/.exec(v)) && last) {
      var a = +m[2] * Math.PI / 180;
      p = [last[0] + m[1] * Math.cos(a), last[1] + m[1] * Math.sin(a)];
    } else if ((m = /^@\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)$/.exec(v))) {
      var base = last || [0, 0];
      p = [base[0] + +m[1], base[1] + +m[2]];
    } else if ((m = /^(-?[\d.]+)\s*,\s*(-?[\d.]+)$/.exec(v))) {
      p = [+m[1], +m[2]];
    }
    if (!p || !isFinite(p[0]) || !isFinite(p[1])) { toast('Type x,y  or  @dx,dy  or  length<angle'); return; }
    e.target.value = '';
    addDraftPoint(p, p);
  }

  // ===================================================================
  // 10. Toolbar and bottom bar
  // ===================================================================

  function renderToolbar() {
    document.querySelectorAll('.tool').forEach(function (b) { b.classList.toggle('on', b.dataset.tool === st.tool); });
    document.querySelectorAll('#penChips .pen').forEach(function (b) { b.classList.toggle('on', b.dataset.pen === st.pen); });
    $('linetypeSel').value = st.linetype;
    $('materialSel').value = st.material;
    $('hatchSel').value = st.hatch;
    svg.classList.toggle('select', st.tool === 'select');
  }

  function setTool(t) {
    if (st.draft) cancelDraft();
    st.tool = t;
    st.snap = null;
    renderToolbar();
    renderOverlay();
  }

  function buildBars() {
    $('toolbar').innerHTML = TOOLS.map(function (t) {
      return '<button class="tool" data-tool="' + t.id + '" title="' + t.label + ' (' + t.key.toUpperCase() + ')"><svg viewBox="0 0 24 24">' + t.icon + '</svg>' + t.label + '</button>';
    }).join('');
    $('toolbar').addEventListener('click', function (e) {
      var b = e.target.closest('.tool');
      if (b) setTool(b.dataset.tool);
    });
    $('penChips').innerHTML = penChipsHtml();
    $('penChips').addEventListener('click', function (e) {
      var b = e.target.closest('.pen');
      if (!b) return;
      st.pen = b.dataset.pen;
      if (st.sel.length && st.tool === 'select') applyToSelection(function (el) { if (!M.isAnnotation(el)) el.graphics.pen = st.pen; });
      renderToolbar();
    });
    $('linetypeSel').innerHTML = Object.keys(QD.LINETYPES).map(function (k) { return '<option value="' + k + '">' + k + '</option>'; }).join('');
    $('linetypeSel').addEventListener('change', function (e) { st.linetype = e.target.value; });
    $('materialSel').innerHTML = '<option value="">(no meaning)</option>' + QD.MATERIALS.map(function (m) { return '<option value="' + m.id + '">' + esc(m.label) + '</option>'; }).join('');
    $('materialSel').addEventListener('change', function (e) {
      st.material = e.target.value;
      var m = QD.materialById(st.material);
      if (m) {
        // Picking a material sets sensible drawing defaults; they can still be changed.
        st.pen = m.pen;
        if (m.hatch) st.hatch = m.hatch;
        if (m.kind === 'region' && st.tool !== 'rect' && st.tool !== 'region') setTool('rect');
        if (m.kind === 'line' && ['line', 'polyline', 'arc', 'circle'].indexOf(st.tool) < 0) setTool('polyline');
      }
      renderToolbar();
    });
    $('hatchSel').innerHTML = hatchOptions();
    $('hatchSel').addEventListener('change', function (e) { st.hatch = e.target.value; });
  }

  function penChipsHtml(active) {
    return QD.PENS.map(function (p) {
      var w = Math.max(1, Math.round(settings.pens[p.id] * 6));
      return '<button class="pen' + (active === p.id ? ' on' : '') + '" data-pen="' + p.id + '" title="' + p.id + ' ' + p.name + ' (' + settings.pens[p.id] + ' mm): ' + p.use + '"><i style="height:' + w + 'px;' + (p.gray ? 'background:#8c8c8c' : '') + '"></i>' + p.id + '</button>';
    }).join('');
  }

  function hatchOptions() {
    return Object.keys(QD.HATCHES).map(function (k) { return '<option value="' + k + '">' + esc(QD.HATCHES[k].label) + '</option>'; }).join('');
  }

  function applyToSelection(fn) {
    var els = st.sel.map(function (id) { return M.byId(st.detail, id); }).filter(Boolean);
    if (!els.length) return;
    mutate(function () { els.forEach(fn); });
  }

  // ===================================================================
  // 11. Panels
  // ===================================================================

  function renderPanels() {
    renderSelectionPanel();
    renderMeaningPanel();
    renderRelationshipsPanel();
    renderReviewPanel();
    renderDetailPanel();
    renderLibraryPanel();
  }

  function selected() { return st.sel.length === 1 ? M.byId(st.detail, st.sel[0]) : null; }

  function opt(list, val, labelFn) {
    return list.map(function (v) { return '<option value="' + esc(v) + '"' + (v === val ? ' selected' : '') + '>' + esc(labelFn ? labelFn(v) : v) + '</option>'; }).join('');
  }

  function fmtPt(p) { return G.fmtNum(p[0]) + ', ' + G.fmtNum(p[1]); }

  // ----- Selection -----
  function renderSelectionPanel() {
    var box = $('pSelection');
    var d = st.detail;
    if (!st.sel.length) {
      var counts = {};
      d.elements.forEach(function (e) { counts[e.geometry.type] = (counts[e.geometry.type] || 0) + 1; });
      box.innerHTML = '<p class="muted small">Nothing selected. Use the Select tool and tap an element.</p>' +
        '<p class="small">' + d.elements.length + ' elements' + (d.elements.length ? ': ' + Object.keys(counts).map(function (k) { return counts[k] + ' ' + k; }).join(', ') : '') + '.</p>';
      return;
    }
    if (st.sel.length > 1) {
      box.innerHTML = '<p><strong>' + st.sel.length + ' elements selected.</strong></p>' +
        '<div class="pens-inline" data-act="pen">' + penChipsHtml() + '</div>' +
        '<div class="row"><button class="btn small danger" data-act="delete">Delete</button><button class="btn small" data-act="duplicate">Duplicate</button></div>';
      bindSelectionActions(box);
      return;
    }
    var el = selected();
    if (!el) { box.innerHTML = ''; return; }
    var g = el.geometry, gr = el.graphics;
    var h = '<p><strong>' + esc(M.label(el)) + '</strong></p>';
    h += '<div class="pens-inline" data-act="pen">' + penChipsHtml(gr.pen) + '</div>';
    if (['line', 'polyline', 'region', 'circle', 'arc'].indexOf(g.type) >= 0) {
      h += '<label class="blk">Linetype<select data-f="linetype">' + opt(Object.keys(QD.LINETYPES), gr.linetype || 'continuous') + '</select></label>';
    }
    if (g.type === 'region') {
      h += '<div class="grid2"><label class="blk">Hatch<select data-f="hatch">' + Object.keys(QD.HATCHES).map(function (k) {
        return '<option value="' + k + '"' + ((gr.hatch || 'none') === k ? ' selected' : '') + '>' + esc(QD.HATCHES[k].label) + '</option>';
      }).join('') + '</select></label>' +
        '<label class="blk">Hatch pen<select data-f="hatchPen">' + opt(QD.PENS.map(function (p) { return p.id; }), gr.hatchPen || 'P1') + '</select></label></div>' +
        '<label class="check"><input type="checkbox" data-f="boundary"' + (gr.boundary !== false ? ' checked' : '') + '> Draw boundary line</label>';
    }
    if (g.type === 'polyline') h += '<label class="check"><input type="checkbox" data-f="closed"' + (g.closed ? ' checked' : '') + '> Closed</label>';
    if (g.type === 'text') {
      h += '<label class="blk">Text<textarea data-f="text" rows="3">' + esc(gr.text) + '</textarea></label>' +
        '<div class="grid2"><label class="blk">Height (paper mm)<input type="number" step="0.1" min="0.5" data-f="size" value="' + (gr.size || settings.textMM) + '"></label>' +
        '<label class="blk">Align<select data-f="anchor">' + opt(['start', 'middle', 'end'], gr.anchor || 'start') + '</select></label>' +
        '<label class="blk">Rotation (°)<input type="number" step="1" data-f="rotation" value="' + (gr.rotation || 0) + '"></label></div>';
    }
    if (g.type === 'leader') h += '<label class="blk">Arrowhead<select data-f="arrow">' + opt(['arrow', 'dot', 'none'], gr.arrow || 'arrow') + '</select></label>';
    if (g.type === 'dimension') {
      h += '<div class="grid2"><label class="blk">Text override<input type="text" data-f="dimtext" value="' + esc(gr.text || '') + '" placeholder="' + esc(G.formatLength(G.dist(g.points[0], g.points[1]), d.units)) + '"></label>' +
        '<label class="blk">Offset<input type="number" step="any" data-f="offset" value="' + G.fmtNum(g.offset || 0) + '"></label></div>';
    }
    if (g.type === 'circle' || g.type === 'arc') {
      h += '<div class="grid2"><label class="blk">Radius<input type="number" step="any" min="0" data-f="radius" value="' + G.fmtNum(g.radius) + '"></label>';
      if (g.type === 'arc') h += '<label class="blk">Start (°)<input type="number" step="any" data-f="start" value="' + G.fmtNum(g.start) + '"></label><label class="blk">End (°)<input type="number" step="any" data-f="end" value="' + G.fmtNum(g.end) + '"></label>';
      h += '</div>';
    }
    var pts = M.points(el);
    h += '<label class="blk">Coordinates (' + d.units + ', one "x, y" per line)<textarea class="coords" data-f="coords" rows="' + Math.min(8, pts.length + 1) + '">' + pts.map(fmtPt).join('\n') + '</textarea></label>';
    h += '<div class="row"><button class="btn small" data-act="duplicate">Duplicate</button><button class="btn small" data-act="back">Send to back</button><button class="btn small danger" data-act="delete">Delete</button></div>';
    box.innerHTML = h;
    bindSelectionActions(box);

    box.querySelectorAll('[data-f]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var f = inp.dataset.f;
        var v = inp.type === 'checkbox' ? inp.checked : inp.value;
        if (f === 'coords') {
          var rows = v.split('\n').map(function (s) { return s.trim(); }).filter(Boolean).map(function (s) { return s.split(/[\s,]+/).map(Number); });
          if (!rows.every(function (r) { return r.length === 2 && isFinite(r[0]) && isFinite(r[1]); })) { toast('Each line needs two numbers: x, y'); renderPanels(); return; }
          if (g.points) {
            var min = { line: 2, polyline: 2, region: 3, leader: 2, dimension: 2, breakline: 2 }[g.type];
            if (rows.length < min) { toast('This element needs at least ' + min + ' points.'); renderPanels(); return; }
            if ((g.type === 'line' || g.type === 'dimension' || g.type === 'breakline') && rows.length !== 2) { toast('This element takes exactly 2 points.'); renderPanels(); return; }
          } else if (rows.length !== 1) { toast('This element takes exactly 1 point.'); renderPanels(); return; }
          mutate(function () {
            if (g.points) g.points = rows;
            else if (g.type === 'text') g.at = rows[0];
            else g.center = rows[0];
          });
          return;
        }
        mutate(function () {
          if (f === 'linetype') { if (v === 'continuous') delete gr.linetype; else gr.linetype = v; }
          else if (f === 'hatch') gr.hatch = v;
          else if (f === 'hatchPen') gr.hatchPen = v;
          else if (f === 'boundary') gr.boundary = v ? undefined : false;
          else if (f === 'closed') g.closed = v;
          else if (f === 'text') gr.text = v;
          else if (f === 'size') gr.size = Math.max(0.5, +v || settings.textMM);
          else if (f === 'anchor') gr.anchor = v;
          else if (f === 'rotation') gr.rotation = +v || 0;
          else if (f === 'arrow') gr.arrow = v;
          else if (f === 'dimtext') { if (v) gr.text = v; else delete gr.text; }
          else if (f === 'offset') g.offset = +v || 0;
          else if (f === 'radius') g.radius = Math.max(1e-6, +v || g.radius);
          else if (f === 'start') g.start = +v || 0;
          else if (f === 'end') g.end = +v || 0;
        });
      });
    });
  }

  function bindSelectionActions(box) {
    box.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        var act = b.dataset.act;
        if (act === 'pen') {
          var chip = e.target.closest('.pen');
          if (chip) applyToSelection(function (el) { el.graphics.pen = chip.dataset.pen; });
        } else if (act === 'delete') deleteSelection();
        else if (act === 'duplicate') duplicateSelection();
        else if (act === 'back') mutate(function () {
          var el = selected();
          var i = st.detail.elements.indexOf(el);
          st.detail.elements.splice(i, 1);
          st.detail.elements.unshift(el);
        });
      });
    });
  }

  function deleteSelection() {
    if (!st.sel.length) return;
    var ids = st.sel.slice();
    mutate(function () {
      var d = st.detail;
      // Deleting a leader also removes its note; relationships to removed elements go too.
      d.relationships.forEach(function (r) { if (r.type === 'annotates' && ids.indexOf(r.from) >= 0 && r.note && ids.indexOf(r.note) < 0) ids.push(r.note); });
      d.elements = d.elements.filter(function (e) { return ids.indexOf(e.id) < 0; });
      d.relationships = d.relationships.filter(function (r) { return ids.indexOf(r.from) < 0 && ids.indexOf(r.to) < 0; });
      d.relationships.forEach(function (r) { if (r.note && ids.indexOf(r.note) >= 0) delete r.note; });
      st.sel = [];
    });
  }

  function duplicateSelection() {
    if (!st.sel.length) return;
    var off = gridSize() * 4;
    mutate(function () {
      var d = st.detail;
      var fresh = [];
      st.sel.forEach(function (id) {
        var src = M.byId(d, id);
        if (!src) return;
        var c = M.clone(src);
        c.id = M.nextId(d, id.replace(/\d+$/, '') || 'e');
        M.translate(c, off, -off);
        d.elements.push(c);
        fresh.push(c.id);
      });
      st.sel = fresh;
    });
  }

  // ----- Meaning, intent, logic -----
  function provenanceHtml(item) {
    if (!item) return '';
    return '<span class="badge ' + esc(item.source || 'architect') + '">' + esc(QD.humanize(item.source || 'architect')) + '</span> ' +
      (item.confidence ? '<span class="badge">' + esc(item.confidence) + '</span>' : '');
  }

  function notesListHtml(list, kind) {
    if (!list || !list.length) return '<p class="muted small">None yet.</p>';
    return '<ul class="list">' + list.map(function (it, i) {
      var inferred = it.source === 'ai_inferred' && it.confidence !== 'confirmed';
      return '<li><div>' + esc(it.text) + '</div><div class="row"><span>' + provenanceHtml(it) + '</span><span class="row">' +
        (inferred ? '<button class="btn small primary" data-confirm="' + kind + ':' + i + '">Confirm</button>' : '') +
        '<button class="x" data-del="' + kind + ':' + i + '" title="Remove">×</button></span></div></li>';
    }).join('') + '</ul>';
  }

  function renderMeaningPanel() {
    var box = $('pMeaning');
    var el = selected();
    if (!el) {
      box.innerHTML = '<p class="muted small">Select one drawn element to record what it is, what it is meant to show, and why it works.</p>' +
        '<p class="small">Tip: set <strong>Draw as</strong> in the bottom bar before drawing, and new lines arrive already tagged.</p>';
      return;
    }
    if (M.isAnnotation(el)) {
      var rel = st.detail.relationships.find(function (r) { return r.type === 'annotates' && (r.from === el.id || r.note === el.id); });
      box.innerHTML = '<p class="small">Notes, leaders, dimensions and break lines describe other elements; they do not carry a material themselves.</p>' +
        (rel ? '<p class="small">This one annotates <button class="link" data-goto="' + esc(rel.to) + '">' + esc(M.label(M.byId(st.detail, rel.to))) + '</button>.</p>' : '<p class="small muted">It is not linked to any element yet.</p>');
      bindGoto(box);
      return;
    }
    var m = el.meaning || {};
    var known = QD.MATERIALS.some(function (x) { return x.id === m.material; });
    var matOpts = '<option value="">(none)</option>' + QD.MATERIALS.map(function (x) { return '<option value="' + x.id + '"' + (x.id === m.material ? ' selected' : '') + '>' + esc(x.label) + '</option>'; }).join('') +
      (m.material && !known ? '<option value="' + esc(m.material) + '" selected>' + esc(QD.humanize(m.material)) + '</option>' : '') +
      '<option value="__other">Other…</option>';
    var h = '<div class="grid2">' +
      '<label class="blk">Material<select data-m="material">' + matOpts + '</select></label>' +
      '<label class="blk">Role<select data-m="role"><option value="">(none)</option>' + opt(QD.ROLES, m.role, QD.humanize) + '</select></label>' +
      '<label class="blk">Source<select data-m="source">' + opt(QD.SOURCES, m.source || 'architect', QD.humanize) + '</select></label>' +
      '<label class="blk">Confidence<select data-m="confidence">' + opt(QD.CONFIDENCE, m.confidence || 'confirmed') + '</select></label></div>';
    var mat = QD.materialById(m.material);
    if (mat && (mat.pen !== el.graphics.pen || (el.geometry.type === 'region' && mat.hatch && mat.hatch !== el.graphics.hatch))) {
      h += '<button class="btn small" data-act="matstyle">Use ' + esc(mat.label) + ' pen ' + mat.pen + (el.geometry.type === 'region' && mat.hatch ? ' and hatch' : '') + '</button>';
    }
    h += '<hr class="soft"><strong class="small">Intent: what this is meant to show</strong>' + notesListHtml(el.intent, 'intent') +
      '<div class="row"><input type="text" data-add="intent" placeholder="e.g. Turns up 8 in min. above roof" style="flex:1"><button class="btn small" data-addbtn="intent">Add</button></div>';
    h += '<hr class="soft"><strong class="small">Construction logic: why it works</strong>' + notesListHtml(el.logic, 'logic') +
      '<div class="row"><input type="text" data-add="logic" placeholder="e.g. Must be continuous to under the coping" style="flex:1"><button class="btn small" data-addbtn="logic">Add</button></div>';
    box.innerHTML = h;

    box.querySelectorAll('[data-m]').forEach(function (s) {
      s.addEventListener('change', function () {
        var f = s.dataset.m, v = s.value;
        if (f === 'material' && v === '__other') {
          askText('Material name (it will be stored as lower_case_words)', '').then(function (txt) {
            if (!txt) { renderPanels(); return; }
            var id = txt.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
            mutate(function () { el.meaning = Object.assign({ source: 'architect', confidence: 'confirmed' }, el.meaning || {}, { material: id }); });
          });
          return;
        }
        mutate(function () {
          if (f === 'material' && !v) { delete el.meaning; return; }
          el.meaning = el.meaning || { source: 'architect', confidence: 'confirmed' };
          if (f === 'material') {
            el.meaning.material = v;
            var mm = QD.materialById(v);
            if (mm && !el.meaning.role) el.meaning.role = mm.role;
          } else if (v) el.meaning[f] = v;
          else delete el.meaning[f];
        });
      });
    });
    var ms = box.querySelector('[data-act=matstyle]');
    if (ms) ms.addEventListener('click', function () {
      mutate(function () {
        el.graphics.pen = mat.pen;
        if (el.geometry.type === 'region' && mat.hatch) el.graphics.hatch = mat.hatch;
      });
    });
    box.querySelectorAll('[data-addbtn]').forEach(function (b) {
      b.addEventListener('click', function () { addNote(el, b.dataset.addbtn, box.querySelector('[data-add=' + b.dataset.addbtn + ']').value); });
    });
    box.querySelectorAll('[data-add]').forEach(function (inp) {
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') addNote(el, inp.dataset.add, inp.value); });
    });
    box.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var parts = b.dataset.del.split(':');
        mutate(function () { el[parts[0]].splice(+parts[1], 1); });
      });
    });
    box.querySelectorAll('[data-confirm]').forEach(function (b) {
      b.addEventListener('click', function () {
        var parts = b.dataset.confirm.split(':');
        mutate(function () { var it = el[parts[0]][+parts[1]]; it.confidence = 'confirmed'; it.confirmedBy = 'architect'; });
      });
    });
  }

  function addNote(el, kind, text) {
    text = String(text || '').trim();
    if (!text) return;
    mutate(function () {
      el[kind] = el[kind] || [];
      el[kind].push({ text: text, source: 'architect', confidence: 'confirmed' });
    });
  }

  function bindGoto(box) {
    box.querySelectorAll('[data-goto]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!M.byId(st.detail, b.dataset.goto)) return;
        st.sel = [b.dataset.goto];
        setTool('select');
        renderOverlay();
        renderPanels();
      });
    });
  }

  // ----- Relationships -----
  function relSentence(r) {
    var t = QD.RELATIONSHIPS.find(function (x) { return x.id === r.type; });
    return '<button class="link" data-goto="' + esc(r.from) + '">' + esc(M.label(M.byId(st.detail, r.from))) + '</button> <em>' + esc(t ? t.label : r.type) + '</em> ' +
      '<button class="link" data-goto="' + esc(r.to) + '">' + esc(M.label(M.byId(st.detail, r.to))) + '</button>';
  }

  function renderRelationshipsPanel() {
    var box = $('pRelationships');
    var d = st.detail;
    var el = selected();
    var rels = el ? d.relationships.filter(function (r) { return r.from === el.id || r.to === el.id || r.note === el.id; }) : d.relationships;
    var h = '';
    if (!el) h += '<p class="muted small">All relationships in this detail. Select an element to add one.</p>';
    h += rels.length ? '<ul class="list">' + rels.map(function (r) {
      var i = d.relationships.indexOf(r);
      return '<li><div>' + relSentence(r) + '</div><div class="row"><span>' + provenanceHtml(r) + '</span><button class="x" data-delrel="' + i + '" title="Remove">×</button></div></li>';
    }).join('') + '</ul>' : '<p class="muted small">No relationships' + (el ? ' for this element' : '') + ' yet.</p>';
    if (el) {
      h += '<div class="row"><select id="relType">' + QD.RELATIONSHIPS.map(function (t) { return '<option value="' + t.id + '">' + esc(el.id + ' ' + t.label + ' …') + '</option>'; }).join('') + '</select>' +
        '<button class="btn small" id="relPick">' + (st.pickRel ? 'Tap the target…' : 'Pick target') + '</button></div>';
    }
    box.innerHTML = h;
    bindGoto(box);
    box.querySelectorAll('[data-delrel]').forEach(function (b) {
      b.addEventListener('click', function () { mutate(function () { d.relationships.splice(+b.dataset.delrel, 1); }); });
    });
    var pick = $('relPick');
    if (pick) pick.addEventListener('click', function () {
      if (locked()) { toast('This detail is locked.'); return; }
      st.pickRel = { type: $('relType').value, from: el.id };
      renderOverlay();
      renderPanels();
    });
  }

  function completePickRel(raw) {
    var pr = st.pickRel;
    var id = hitTest(raw, [pr.from]);
    if (!id) { toast('No element there. Tap the target element, or press Esc.'); return; }
    st.pickRel = null;
    mutate(function () {
      st.detail.relationships.push({ id: M.nextId(st.detail, 'rel'), type: pr.type, from: pr.from, to: id, source: 'architect' });
    });
  }

  // ----- Critical review -----
  function renderReviewPanel() {
    var box = $('pReview');
    var d = st.detail;
    var h = '<div class="row"><button class="btn small primary" id="runChecks">Run checks</button><span class="muted small">Rule checks read meaning and relationships, not just lines.</span></div>';
    if (st.findings) {
      var fresh = st.findings.filter(function (f) {
        return !d.review.some(function (r) { return r.check === f.check && r.subject === f.subject && r.text === f.text; });
      });
      h += fresh.length ? '<ul class="list">' + fresh.map(function (f) {
        var i = st.findings.indexOf(f);
        return '<li class="finding"><div><span class="badge ' + f.result + '">' + QD.humanize(f.result) + '</span> ' + esc(f.text) + '</div><div class="row">' +
          (f.subject ? '<button class="link" data-goto="' + esc(f.subject) + '">Show ' + esc(f.subject) + '</button>' : '<span></span>') +
          '<button class="btn small" data-keep="' + i + '">Keep in detail</button></div></li>';
      }).join('') + '</ul>' : '<p class="small">No new findings.</p>';
    }
    h += '<hr class="soft"><strong class="small">Review items saved in this detail (' + d.review.length + ')</strong>';
    h += d.review.length ? '<ul class="list">' + d.review.map(function (r, i) {
      return '<li><div><span class="badge ' + esc(r.result) + '">' + esc(QD.humanize(r.result)) + '</span> ' + esc(r.text) + '</div>' +
        '<div class="row"><span>' + provenanceHtml(r) + (r.subject ? ' <button class="link" data-goto="' + esc(r.subject) + '">' + esc(r.subject) + '</button>' : '') + '</span>' +
        '<span class="row"><select data-rstate="' + i + '">' + opt(QD.REVIEW_STATES, r.state || 'open') + '</select><button class="x" data-rdel="' + i + '" title="Remove">×</button></span></div>' +
        '<input type="text" data-ranswer="' + i + '" placeholder="Answer or resolution" value="' + esc(r.answer || '') + '"></li>';
    }).join('') + '</ul>' : '<p class="muted small">None.</p>';
    var el = selected();
    h += '<div class="stack"><textarea id="newReview" rows="2" placeholder="Add your own review note' + (el ? ' about ' + esc(el.id) : '') + '"></textarea>' +
      '<div class="row"><select id="newReviewResult">' + opt(QD.REVIEW_RESULTS, 'open_question', QD.humanize) + '</select><button class="btn small" id="addReview">Add note</button></div></div>';
    box.innerHTML = h;
    bindGoto(box);
    $('runChecks').addEventListener('click', function () {
      st.findings = R.run(st.detail);
      renderPanels();
    });
    box.querySelectorAll('[data-keep]').forEach(function (b) {
      b.addEventListener('click', function () {
        var f = st.findings[+b.dataset.keep];
        mutate(function () {
          d.review.push({ id: M.nextId(d, 'r'), check: f.check, subject: f.subject, result: f.result, state: 'open', text: f.text, source: 'rule', confidence: 'high' });
        });
      });
    });
    box.querySelectorAll('[data-rstate]').forEach(function (s) {
      s.addEventListener('change', function () { mutate(function () { d.review[+s.dataset.rstate].state = s.value; }, { allowLocked: true }); });
    });
    box.querySelectorAll('[data-ranswer]').forEach(function (s) {
      s.addEventListener('change', function () { mutate(function () { d.review[+s.dataset.ranswer].answer = s.value; }, { allowLocked: true }); });
    });
    box.querySelectorAll('[data-rdel]').forEach(function (b) {
      b.addEventListener('click', function () { mutate(function () { d.review.splice(+b.dataset.rdel, 1); }); });
    });
    $('addReview').addEventListener('click', function () {
      var text = $('newReview').value.trim();
      if (!text) return;
      mutate(function () {
        d.review.push({ id: M.nextId(d, 'r'), check: 'manual', subject: el ? el.id : null, result: $('newReviewResult').value, state: 'open', text: text, source: 'architect', confidence: 'confirmed' });
      }, { allowLocked: true });
    });
  }

  // ----- Detail settings -----
  function renderDetailPanel() {
    var box = $('pDetail');
    var d = st.detail;
    box.innerHTML =
      '<label class="blk">Title<input type="text" id="dTitle" value="' + esc(d.title) + '"></label>' +
      '<div class="grid2"><label class="blk">Units<select id="dUnits">' + opt(['in', 'mm'], d.units, function (u) { return u === 'in' ? 'inches' : 'millimeters'; }) + '</select></label>' +
      '<label class="blk">Scale<select id="dScale">' + opt(QD.SCALES.map(function (s) { return s.label; }), d.scale) + '</select></label>' +
      '<label class="blk">Status<select id="dStatus">' + opt(QD.STATUSES, d.status) + '</select></label>' +
      '<label class="blk">Tags<input type="text" id="dTags" value="' + esc((d.tags || []).join(', ')) + '" placeholder="parapet, roof"></label></div>' +
      '<p class="muted small">ID ' + esc(d.id) + (d.derivedFrom ? ' · copied from ' + esc(d.derivedFrom) : '') + ' · modified ' + esc((d.modified || '').slice(0, 16).replace('T', ' ')) + '</p>' +
      (d.status === 'locked' ? '<p class="small"><strong>Locked:</strong> a typical locked detail is the reference other details are checked against. Review notes can still be answered.</p>' : '');
    $('dTitle').addEventListener('change', function (e) { mutate(function () { d.title = e.target.value.trim() || 'Untitled Detail'; }); });
    $('dScale').addEventListener('change', function (e) { mutate(function () { d.scale = e.target.value; }); });
    $('dTags').addEventListener('change', function (e) { mutate(function () { d.tags = e.target.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean); }); });
    $('dStatus').addEventListener('change', function (e) {
      var v = e.target.value;
      if (v === 'locked' && !confirm('Lock this detail? It becomes read-only until you set it back to draft.')) { renderPanels(); return; }
      mutate(function () { d.status = v; }, { allowLocked: true });
    });
    $('dUnits').addEventListener('change', function (e) {
      var v = e.target.value;
      var f = v === 'mm' ? 25.4 : 1 / 25.4;
      if (!confirm('Convert the drawing to ' + (v === 'mm' ? 'millimeters' : 'inches') + '? All coordinates will be multiplied by ' + G.fmtNum(f) + '.')) { renderPanels(); return; }
      mutate(function () {
        d.units = v;
        d.elements.forEach(function (el) {
          M.points(el).forEach(function (p) { p[0] *= f; p[1] *= f; });
          if (el.geometry.radius) el.geometry.radius *= f;
          if (el.geometry.offset) el.geometry.offset *= f;
        });
        // Swap to the nearest customary scale for the new unit system.
        var map = v === 'mm'
          ? { '3in = 1ft': '1:5', '1-1/2in = 1ft': '1:10', '1in = 1ft': '1:10', '3/4in = 1ft': '1:20' }
          : { '1:5': '3in = 1ft', '1:10': '1-1/2in = 1ft', '1:20': '3/4in = 1ft', '1:2': 'Half full size' };
        if (map[d.scale]) d.scale = map[d.scale];
      });
      fit();
    });
  }

  // ----- Library -----
  function library() { return lsGet('qd.library', {}); }

  function renderLibraryPanel() {
    var box = $('pLibrary');
    var lib = library();
    var q = (st.libQuery || '').toLowerCase();
    var items = Object.keys(lib).map(function (k) { return lib[k]; }).filter(function (d) {
      if (!q) return true;
      var hay = [d.title, (d.tags || []).join(' '), d.elements.map(function (e) { return e.meaning ? e.meaning.material : ''; }).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    }).sort(function (a, b) { return String(b.modified).localeCompare(String(a.modified)); });
    var inLib = !!lib[st.detail.id];
    box.innerHTML =
      '<div class="row"><button class="btn small primary" id="libSave">' + (inLib ? 'Save to library' : 'Add to library') + '</button>' +
      '<button class="btn small" id="libCopy">Save as new copy</button></div>' +
      '<div class="row"><button class="btn small" id="libNew">New detail</button><button class="btn small" id="libSample">Open sample</button><button class="btn small" id="libImport">Import JSON</button></div>' +
      '<input type="text" id="libSearch" placeholder="Search title, tag, or material" value="' + esc(st.libQuery || '') + '">' +
      (items.length ? '<ul class="list">' + items.map(function (d) {
        return '<li><div class="row"><strong>' + esc(d.title) + '</strong><span class="chip ' + esc(d.status) + '">' + esc(d.status) + '</span></div>' +
          '<div class="muted small">' + esc((d.tags || []).join(', ') || 'no tags') + ' · ' + d.elements.length + ' elements · ' + esc(String(d.modified || '').slice(0, 10)) + '</div>' +
          '<div class="row"><button class="btn small" data-open="' + esc(d.id) + '">Open</button><button class="x" data-ldel="' + esc(d.id) + '" title="Delete from library">×</button></div></li>';
      }).join('') + '</ul>' : '<p class="muted small">' + (q ? 'No matches.' : 'The library is empty. Details are stored in this browser only; download JSON to keep a file copy.') + '</p>');

    $('libSave').addEventListener('click', function () {
      var l = library();
      l[st.detail.id] = st.detail;
      if (lsSet('qd.library', l)) { st.dirty = false; toast('Saved "' + st.detail.title + '" to the library.'); }
      renderPanels();
    });
    $('libCopy').addEventListener('click', function () {
      var c = M.clone(st.detail);
      c.derivedFrom = st.detail.id;
      c.id = 'detail-' + Date.now().toString(36);
      c.title = st.detail.title + ' (copy)';
      c.status = 'draft';
      c.created = c.modified = new Date().toISOString();
      var l = library();
      l[c.id] = c;
      lsSet('qd.library', l);
      loadDetail(c);
      toast('Copy saved. It remembers the detail it came from.');
    });
    $('libNew').addEventListener('click', function () { if (okToReplace()) loadDetail(M.newDetail()); });
    $('libSample').addEventListener('click', function () { if (okToReplace()) loadDetail(QD.sampleDetail()); });
    $('libImport').addEventListener('click', function () { if (okToReplace()) $('fileInput').click(); });
    $('libSearch').addEventListener('input', function (e) {
      st.libQuery = e.target.value;
      var pos = e.target.selectionStart;
      renderLibraryPanel();
      var s = $('libSearch'); s.focus(); s.setSelectionRange(pos, pos);
    });
    box.querySelectorAll('[data-open]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!okToReplace()) return;
        var d = library()[b.dataset.open];
        if (d) loadDetail(M.clone(d));
      });
    });
    box.querySelectorAll('[data-ldel]').forEach(function (b) {
      b.addEventListener('click', function () {
        var l = library();
        var d = l[b.dataset.ldel];
        if (!d || !confirm('Delete "' + d.title + '" from the library? This cannot be undone.')) return;
        delete l[b.dataset.ldel];
        lsSet('qd.library', l);
        renderLibraryPanel();
      });
    });
  }

  function okToReplace() {
    if (!st.dirty || !st.detail.elements.length) return true;
    return confirm('The current detail has changes that are not in the library. Replace it anyway? (Undo will not bring it back.)');
  }

  function importFile(file) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var d = JSON.parse(r.result);
        var problems = M.validate(d);
        if (problems.length) {
          logError('Import of ' + file.name + ' failed: ' + problems.join(' | '));
          toast('That file is not a valid detail: ' + problems[0]);
          return;
        }
        loadDetail(d, { dirty: true });
        toast('Opened ' + file.name);
      } catch (e) {
        logError('Import failed: ' + e.message);
        toast('Could not read that file as JSON.');
      }
    };
    r.readAsText(file);
  }

  // ===================================================================
  // 12. Settings drawer
  // ===================================================================

  function renderSettings() {
    var h = '<h3>Pen widths (paper mm)</h3><div class="grid2">' + QD.PENS.map(function (p) {
      return '<label>' + p.id + ' ' + p.name + '<input type="number" step="0.01" min="0.05" data-pen="' + p.id + '" value="' + settings.pens[p.id] + '"></label>';
    }).join('') + '</div>' +
      '<h3>Drawing</h3><div class="grid2">' +
      '<label>Text height (mm)<input type="number" step="0.1" min="0.5" data-s="textMM" value="' + settings.textMM + '"></label>' +
      '<label>Grid (inches)<input type="number" step="any" min="0.01" data-s="gridIn" value="' + settings.gridIn + '"></label>' +
      '<label>Grid (mm)<input type="number" step="any" min="0.1" data-s="gridMM" value="' + settings.gridMM + '"></label>' +
      '<label>Thinnest line on screen (px)<input type="number" step="0.25" min="0" data-s="minScreenPx" value="' + settings.minScreenPx + '"></label>' +
      '<label>PNG/JPEG resolution (dpi)<input type="number" step="50" min="72" max="1200" data-s="dpi" value="' + settings.dpi + '"></label></div>' +
      '<label class="check"><input type="checkbox" data-c="gridSnap"' + (settings.gridSnap ? ' checked' : '') + '> Snap to grid</label>' +
      '<label class="check"><input type="checkbox" data-c="objectSnap"' + (settings.objectSnap ? ' checked' : '') + '> Snap to endpoints and midpoints</label>' +
      '<label class="check"><input type="checkbox" data-c="showGrid"' + (settings.showGrid ? ' checked' : '') + '> Show grid</label>' +
      '<label class="check"><input type="checkbox" data-c="showErrors"' + (settings.showErrors ? ' checked' : '') + '> Show errors (bottom of page)</label>' +
      '<h3>Keys</h3><p class="small muted">' + TOOLS.map(function (t) { return t.key.toUpperCase() + ' ' + t.label; }).join(' · ') +
      ' · 1–5 pens, 6 screen · Enter finish · Esc cancel · Shift straight lines · Delete · Ctrl+Z / Ctrl+Shift+Z · F fit</p>' +
      '<div class="row"><button class="btn small ghost" id="resetSettings">Reset settings</button></div>';
    $('settingsBody').innerHTML = h;
    $('settingsBody').querySelectorAll('[data-pen]').forEach(function (i) {
      i.addEventListener('change', function () { settings.pens[i.dataset.pen] = Math.max(0.05, +i.value || QD.penById(i.dataset.pen).mm); saveSettings(); });
    });
    $('settingsBody').querySelectorAll('[data-s]').forEach(function (i) {
      i.addEventListener('change', function () { var v = +i.value; if (v > 0 || (i.dataset.s === 'minScreenPx' && v === 0)) settings[i.dataset.s] = v; saveSettings(); });
    });
    $('settingsBody').querySelectorAll('[data-c]').forEach(function (i) {
      i.addEventListener('change', function () { settings[i.dataset.c] = i.checked; saveSettings(); });
    });
    $('resetSettings').addEventListener('click', function () { settings = M.clone(DEFAULT_SETTINGS); saveSettings(); renderSettings(); });
  }

  function saveSettings() {
    lsSet('qd.settings', settings);
    $('penChips').innerHTML = penChipsHtml();
    renderAll();
  }

  // ===================================================================
  // 13. Exports
  // ===================================================================

  function doExport(kind) {
    var d = st.detail;
    if (!d.elements.length && kind !== 'json') { toast('Nothing to export yet.'); return; }
    var base = X.fileBase(d);
    try {
      if (kind === 'pdf') X.download(X.pdf(d, settings), base + '.pdf', 'application/pdf');
      else if (kind === 'svg') X.download(S.document(d, settings), base + '.svg', 'image/svg+xml');
      else if (kind === 'dxf') X.download(X.dxf(d, settings), base + '.dxf', 'application/dxf');
      else if (kind === 'json') X.download(JSON.stringify(d, null, 2), base + '.json', 'application/json');
      else if (kind === 'png' || kind === 'jpeg') {
        X.raster(d, settings, 'image/' + kind, settings.dpi).then(function (blob) {
          X.download(blob, base + (kind === 'png' ? '.png' : '.jpg'));
        }).catch(function (e) { logError('Image export failed: ' + e.message); toast('Image export failed.'); });
        return;
      }
      toast('Exported ' + kind.toUpperCase() + '.');
    } catch (e) {
      logError('Export ' + kind + ' failed: ' + e.message);
      toast('Export failed. Turn on "Show errors" in settings for details.');
    }
  }

  // ===================================================================
  // 14. Keyboard
  // ===================================================================

  function onKeyDown(e) {
    st.shift = e.shiftKey;
    var tag = (e.target.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    if (e.key === 'Escape') {
      if (st.draft || st.pickRel) cancelDraft();
      else if (st.sel.length) { st.sel = []; renderOverlay(); renderPanels(); }
      if (typing) e.target.blur();
      return;
    }
    if (typing) return;
    var mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod) return;
    if (e.key === ' ') { spaceDown = true; e.preventDefault(); return; }
    if (e.key === 'Enter') {
      // preventDefault keeps this Enter from typing into the note dialog that finishing may open.
      if (st.draft && MULTI_POINT[st.draft.tool]) { e.preventDefault(); finishDraft(); }
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); return; }
    if (e.key === 'f' || e.key === 'F') { fit(); return; }
    if (/^[1-6]$/.test(e.key)) {
      st.pen = QD.PENS[+e.key - 1].id;
      if (st.sel.length && st.tool === 'select') applyToSelection(function (el) { if (!M.isAnnotation(el)) el.graphics.pen = st.pen; });
      renderToolbar();
      return;
    }
    var t = TOOLS.find(function (x) { return x.key === e.key.toLowerCase(); });
    if (t) setTool(t.id);
    else if (/^[\d.@\-]$/.test(e.key) && st.tool !== 'select' && st.tool !== 'text' && !locked()) {
      // Start typing a coordinate without reaching for the box.
      $('coordInput').focus();
    }
  }

  // ===================================================================
  // 15. Start
  // ===================================================================

  function init() {
    svg = $('canvas');
    gGrid = $('gGrid'); gDraw = $('gDraw'); gSel = $('gSel'); gDraft = $('gDraft'); gHandles = $('gHandles'); gSnap = $('gSnap');
    buildBars();

    svg.addEventListener('pointerdown', onPointerDown);
    svg.addEventListener('pointermove', onPointerMove);
    svg.addEventListener('pointerup', onPointerUp);
    svg.addEventListener('pointercancel', onPointerUp);
    svg.addEventListener('pointerleave', function () { if (!st.drag) { st.snap = null; renderOverlay(); } });
    svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('dblclick', function () { if (st.draft && MULTI_POINT[st.draft.tool]) finishDraft(); });
    svg.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      if (st.draft && MULTI_POINT[st.draft.tool]) finishDraft(); else cancelDraft();
    });
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', function (e) { st.shift = e.shiftKey; if (e.key === ' ') spaceDown = false; });
    window.addEventListener('resize', function () { applyView(); renderDrawing(); renderOverlay(); });

    $('coordInput').addEventListener('keydown', onCoordInput);
    $('finishBtn').addEventListener('click', finishDraft);
    $('cancelBtn').addEventListener('click', cancelDraft);
    $('zoomIn').addEventListener('click', function () { var vb = viewBox(); zoomAt(1.4, vb.left + vb.W / 2, vb.top + vb.H / 2); });
    $('zoomOut').addEventListener('click', function () { var vb = viewBox(); zoomAt(1 / 1.4, vb.left + vb.W / 2, vb.top + vb.H / 2); });
    $('zoomFit').addEventListener('click', fit);
    $('undoBtn').addEventListener('click', undo);
    $('redoBtn').addEventListener('click', redo);
    document.querySelectorAll('[data-export]').forEach(function (b) { b.addEventListener('click', function () { doExport(b.dataset.export); }); });
    $('fileInput').addEventListener('change', function (e) { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ''; });

    // Panels: +/- toggles, several open at once; remembered per browser.
    var closed = lsGet('qd.closedPanels', []);
    document.querySelectorAll('.panel').forEach(function (p) {
      var btn = p.querySelector('.toggle');
      function set(isClosed) { p.classList.toggle('closed', isClosed); btn.textContent = isClosed ? '+' : '−'; btn.setAttribute('aria-expanded', String(!isClosed)); }
      set(closed.indexOf(p.dataset.panel) >= 0);
      p.querySelector('h2').addEventListener('click', function () {
        var now = !p.classList.contains('closed');
        set(now);
        var list = lsGet('qd.closedPanels', []).filter(function (x) { return x !== p.dataset.panel; });
        if (now) list.push(p.dataset.panel);
        lsSet('qd.closedPanels', list);
      });
    });

    $('gear').addEventListener('click', function () { var s = $('settings'); s.hidden = !s.hidden; if (!s.hidden) renderSettings(); });
    $('closeSettings').addEventListener('click', function () { $('settings').hidden = true; });
    $('clearErrors').addEventListener('click', function () { errors = []; renderErrors(); });

    var saved = lsGet('qd.current', null);
    var start = saved && !M.validate(saved).length ? saved : QD.sampleDetail();
    loadDetail(start, { dirty: !!saved });
    requestAnimationFrame(fit);
  }

  // Exposed for debugging and for the future MCP bridge.
  QD.app = { state: st, settings: function () { return settings; }, load: loadDetail, mutate: mutate, exportAs: doExport };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(globalThis.QD = globalThis.QD || {});
