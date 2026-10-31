// Quick Detail app — Note editor and title block.
// The overlay textarea for note text, and the title block: tap the name for Info, drag across the scale to change it.
// Part of the app split across sketch/app/*.js. The parts share the page's global scope, so load order matters:
// see the <script> list in index.html and docs/code-map/index.html.
'use strict';

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
    sdrag = { x0: e.clientX, i0: i0, i: i0, moved: false, before: { scale: detail.scale, items: clone(detail.items) } };
  });
  box.addEventListener('pointermove', function (e) {
    if (!sdrag) return;
    var dx = e.clientX - sdrag.x0;
    if (Math.abs(dx) > TAP_PX) sdrag.moved = true;
    var i = Math.max(0, Math.min(SK.SCALES.length - 1, sdrag.i0 + Math.round(dx / 40)));
    if (i !== sdrag.i) {
      sdrag.i = i;
      detail.scale = SK.SCALES[i].key;
      detail.items = SK.rescaleAnnotations(sdrag.before.items, factorOf(detail) / factorOf(sdrag.before));
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
    if (detail.scale !== d.before.scale) {
      ops.push({ type: 'scale', before: d.before, after: { scale: detail.scale, items: clone(detail.items) } });
      redos = [];
      logEvent({ type: 'replace', items: clone(detail.items) });
      changed();
    }
  }
  box.addEventListener('pointerup', up);
  box.addEventListener('pointercancel', up);
})();

// Changing the scale keeps annotations the same size on paper (see SK.rescaleAnnotations). One undo step brings back the scale and the items.
function setScale(key) {
  if (key === detail.scale) return;
  var before = { scale: detail.scale, items: clone(detail.items) };
  var ratio = SK.scaleOf(key).factor / factorOf(detail);
  detail.scale = key;
  detail.items = SK.rescaleAnnotations(detail.items, ratio);
  ops.push({ type: 'scale', before: before, after: { scale: key, items: clone(detail.items) } });
  redos = [];
  logEvent({ type: 'replace', items: clone(detail.items) });
  changed();
}
