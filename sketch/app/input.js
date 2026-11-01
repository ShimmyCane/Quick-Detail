// Quick Detail app — Pointer input.
// Routes pointer events: the pen draws, fingers pan once a pen is seen, two fingers pinch, the wheel zooms.
// Part of the app split across sketch/app/*.js. The parts share the page's global scope, so load order matters:
// see the <script> list in index.html and docs/code-map/index.html.
'use strict';

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

// Pointer up or cancel: ends a gesture or the tool's action.
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

// Zooms by k, keeping the screen point sp still.
function zoomAt(sp, k) {
  var w = SK.toWorld(view, sp);
  view.z = clampZ(view.z * k);
  view.x = w[0] - sp[0] / view.z;
  view.y = w[1] - sp[1] / view.z;
  redraw();
}

// Starts panning with this pointer.
function startPan(e, sp) {
  canvas.setPointerCapture(e.pointerId);
  gesture = { kind: 'pan', id: e.pointerId, s0: sp, v0: clone(view) };
}
// Starts a two-finger pinch.
function startPinch(ids) {
  var a = touches[ids[0]], b = touches[ids[1]];
  gesture = { kind: 'pinch', ids: ids.slice(0, 2), v0: clone(view), c0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], d0: Math.max(dist(a, b), 1) };
}
// Moves the view for a pan or pinch.
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
