// Quick Detail app — Selection and its chips.
// select(), the chips bar for the selected item, duplicate and delete, the collapse button and the microphone.
// Part of the app split across sketch/app/*.js. The parts share the page's global scope, so load order matters:
// see the <script> list in index.html and docs/code-map/index.html.
'use strict';

// ===================================================================
// Selection and its chips
// ===================================================================

// Selects an item (or nothing), optionally one of a note's arrows, and shows its chips.
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

// Deletes the selected item.
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

// A dropdown chip.
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

// The chips bar for the selected item: its options, Duplicate, draw order and Delete.
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
