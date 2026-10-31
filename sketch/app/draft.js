// Quick Detail app — Tool steps: text, dimension, hatch.
// setTool() and the multi-tap steps of the text, dimension, hatch and add-arrow tools, with their hints.
// Part of the app split across sketch/app/*.js. The parts share the page's global scope, so load order matters:
// see the <script> list in index.html and docs/code-map/index.html.
'use strict';

// ---- text, dimension and add-arrow steps ----

// Picks a tool: draw, select, text, dim, hatch or erase. Picking the same one again goes back to drawing.
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
  renderDimPicker();
}

// Ends any tool step and goes back to drawing.
function endDraft() {
  draft = null;
  tool = 'draw';
  $('hint').hidden = true;
  document.querySelectorAll('.rail [data-act], #lrail [data-act]').forEach(function (b) { b.classList.remove('on'); });
  renderDimPicker();
  redraw();
}

// Shows a step hint at the top, with optional extra controls.
function showHint(text, extra) {
  $('hintText').textContent = text;
  var x = $('hintExtra');
  x.innerHTML = '';
  (extra || []).forEach(function (n) { x.appendChild(n); });
  $('hint').hidden = false;
}

// The hatch hint, with the pattern picker.
function showHatchHint() {
  var pick = el('select', { class: 'field', 'aria-label': 'Hatch pattern', on: { change: function (e) { pen.hatch = e.target.value; } } });
  SK.HATCHES.forEach(function (h) {
    if (h.key !== 'none') pick.appendChild(el('option', { value: h.key, text: h.label, selected: h.key === pen.hatch }));
  });
  showHint('Drag a rectangle, or tap inside a closed shape.', [pick]);
}

// The hint for the next dimension step.
function showDimHint() {
  var need = draft.mode === 'angular' ? 3 : 2;
  var labels = draft.mode === 'angular'
    ? ['Tap the corner (vertex).', 'Tap a point on the first side.', 'Tap a point on the second side.']
    : ['Tap the first point.', 'Tap the second point.'];
  var text = draft.placing ? 'Drag out the dimension line, then let go.' : labels[Math.min(draft.pts.length, need - 1)];
  showHint(text);
}

// Pointer down during a tool step.
function draftDown(w) {
  if (draft.tool === 'hatch') { draft.start = w; draft.cur = w; redraw(); return; }
  if (draft.tool === 'text' && draft.step === 1) { draft.start = w; draft.cur = w; draft.snapKind = null; }
  else draftMove(w);
}

// Pointer move during a tool step: snaps the cursor, or follows it while placing.
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

// Finishes a hatch: a dragged rectangle, or a tap inside a closed stroke.
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

// Pointer up during a tool step: places the arrow point, the note, a dimension point or line, or a new arrow.
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

// A dimension from the picked points, with its line through at.
function buildDim(at) {
  var p = draft.pts;
  var d = { id: uid('m'), kind: 'dim', mode: draft.mode, at: at, text: null, size: SK.PAPER.text, end: 'tick', roundTo: null, c: pen.color };
  if (draft.mode === 'angular') { d.vertex = p[0]; d.p1 = p[1]; d.p2 = p[2]; }
  else { d.p1 = p[0]; d.p2 = p[1]; }
  if (draft.mode === 'ortho') d.orient = SK.orthoOrient(d.p1, d.p2, at);
  return d;
}
