// Quick Detail app — Left bar, right rail and keys.
// Colour, weight and dimension pickers, the left-bar tools, the overflow column on small screens,
// hold-for-redo, the scene button, library header wiring, and keyboard shortcuts.
// Part of the app split across sketch/app/*.js. The parts share the page's global scope, so load order matters:
// see the <script> list in index.html and docs/code-map/index.html.
'use strict';

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

// Dimension type: a picker like colour and weight. The dot shows the current type; the row holds the three.
var DIM_ICON = {
  ortho: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 4v16M21 4v16M3 12h18M3 12l3-2.5M3 12l3 2.5M21 12l-3-2.5M21 12l-3 2.5"/></svg>',
  aligned: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 20L20 4M2 15l7 7M22 9l-7-7"/><path d="M8.5 15.5l-1.5 1.5"/></svg>',
  angular: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 20H21M4 20L18 5"/><path d="M11 20a7 7 0 0 0-2.4-5.3"/></svg>'
};
var DIM_NAME = { ortho: 'Orthographic (horizontal or vertical)', aligned: 'Aligned (along the line)', angular: 'Angular (between two lines)' };
(function buildDimRow() {
  var row = document.querySelector('#dimPicker .pick-row');
  ['ortho', 'aligned', 'angular'].forEach(function (m) {
    var b = el('button', { type: 'button', 'data-dimmode': m, title: DIM_NAME[m], 'aria-label': DIM_NAME[m] });
    b.innerHTML = DIM_ICON[m];
    row.appendChild(b);
  });
})();
function renderDimPicker() {
  var cur = $('dimCur');
  cur.innerHTML = DIM_ICON[dimMode];
  cur.setAttribute('data-dim', dimMode);
  cur.classList.toggle('on', tool === 'dim');
  document.querySelectorAll('#dimPicker [data-dimmode]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-dimmode') === dimMode); });
}
setupPicker('dimPicker', 'data-dimmode', function (m) {
  dimMode = m;
  if (tool === 'dim') { draft = { tool: 'dim', mode: m, pts: [] }; showDimHint(); redraw(); }
  else setTool('dim');
  renderDimPicker();
});
renderDimPicker();

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
  if (act === 'library') openLibrary();
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
