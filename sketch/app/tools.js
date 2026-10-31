// Quick Detail app — Tools: strokes, hits, handles.
// toolDown / toolMove / toolUp dispatch to the active tool. Pen strokes, erase, picking, snapping,
// and dragging the handles of a selected item (move, scale, turn, note width, dimension points).
// Part of the app split across sketch/app/*.js. The parts share the page's global scope, so load order matters:
// see the <script> list in index.html and docs/code-map/index.html.
'use strict';

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
