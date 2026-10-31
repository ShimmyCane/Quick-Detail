// Quick Detail app — Painting the sheet.
// redraw() paints the grid, underlays, linework, the draft in progress and the selection handles on the canvas.
// Part of the app split across sketch/app/*.js. The parts share the page's global scope, so load order matters:
// see the <script> list in index.html and docs/code-map/index.html.
'use strict';

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

function updateTitle() {
  if (!detail) return;
  $('titleName').textContent = detail.name || 'Untitled detail';
  $('scaleLabel').textContent = detail.scale === 'NTS' ? 'NOT TO SCALE' : 'SCALE: ' + SK.scaleOf(detail.scale).label;
  // Graphic scale: a whole-increment length (1", 2", 3", 6", 12", 2'…) drawn at its true length for this zoom,
  // so the right edge moves as you zoom. The step is the one closest to 110 px.
  var bar = SK.scaleBarChoice(view.z, 110);
  if (bar) { $('scaleBar').style.width = bar.px.toFixed(1) + 'px'; $('barLabel').textContent = bar.label; }
}
