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
  var hex = SK.isHex(pen.color);
  document.querySelectorAll('#colorPicker [data-color]').forEach(function (b) {
    var v = b.getAttribute('data-color');
    b.classList.toggle('on', v === 'custom' ? hex && pen.color.toLowerCase() === pen.custom.toLowerCase() : v === pen.color);
  });
  document.querySelectorAll('#weightPicker [data-weight]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-weight') === pen.weight); });
  var cur = $('colorCur');
  cur.className = 'pick-cur' + (hex ? '' : ' pen-' + pen.color);
  cur.style.background = hex ? pen.color : '';
  $('colorCustom').style.background = pen.custom;
  var wcur = $('weightCur');
  wcur.setAttribute('data-w', pen.weight);
}
// Wires a dot picker (colour, weight, dimension type): tap to open, or press, drag along the row and let go.
function setupPicker(boxId, attr, apply, onOpen) {
  var box = $(boxId), cur = box.querySelector('.pick-cur'), row = box.querySelector('.pick-row');
  var pressing = false;
  function open(on) {
    row.hidden = !on; cur.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (!on) row.querySelectorAll('.hot').forEach(function (b) { b.classList.remove('hot'); });
    if (onOpen) onOpen(on);
  }
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
    var act = t && t.closest ? t.closest('[data-pick-act]') : null;
    if (act && row.contains(act)) { act.click(); return; }   // let go on + or the mixer: press it, keep the row open
    if (!(t && box.contains(t))) open(false);   // let go somewhere else: close without a change
  });
  row.addEventListener('click', function (e) {
    var b = e.target.closest('[' + attr + ']');
    if (b) choose(b);
  });
  document.addEventListener('pointerdown', function (e) {
    if (!row.hidden && !box.contains(e.target)) open(false);
  });
  return { open: open };
}
var colorPicker = setupPicker('colorPicker', 'data-color', function (v) {
  pen.color = v === 'custom' ? pen.custom : v; savePen(); renderPen(); if (tool === 'select') setTool('draw');
}, function (on) {
  // Opening: show the extra rows when the current colour lives there. Closing: close the mixer too.
  if (on) colorExpand(colorExpanded || isExtraColor(pen.color));
  else colorMix.show(false);
});
var colorExpanded = false;   // the + rows stay open between uses until + is tapped again
function isExtraColor(c) { return SK.isHex(c) || ['yellow', 'green', 'magenta', 'grey', 'orange', 'purple'].indexOf(c) >= 0; }
// Shows or hides the two extra colour rows under black, red, blue and +.
function colorExpand(on) {
  colorExpanded = on;
  var row = document.querySelector('#colorPicker .pick-row');
  row.classList.toggle('expanded', on);
  $('colorMore').textContent = on ? '−' : '+';
  $('colorMore').setAttribute('aria-expanded', on ? 'true' : 'false');
  $('colorMore').setAttribute('title', on ? 'Fewer colours' : 'More colours');
  if (!on) colorMix.show(false);
}
$('colorMore').addEventListener('click', function () { colorExpand(!colorExpanded); });
$('colorMixBtn').addEventListener('click', function () { colorMix.show($('colorMix').hidden); });

// The colour mixer: an HSL grid (hue across, lightness down, saturation on the slider) or a CMYK grid
// (cyan across, magenta down, yellow and black on the sliders). Pick on the grid or type a hex, then Use.
// The colour used becomes the custom swatch and the pen colour.
var colorMix = (function () {
  var box = $('colorMix'), grid = $('mixGrid'), g = grid.getContext('2d');
  var s1 = $('mixS1'), s2 = $('mixS2'), hexIn = $('mixHex');
  var mode = 'hsl';
  var hsl = [0, 80, 50], cmyk = [0, 0, 0, 0];   // h 0-360, s and l 0-100; c, m, y, k 0-100
  var hex = pen.custom;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function toHex(rgb) { return '#' + rgb.map(function (v) { return ('0' + Math.round(clamp(v, 0, 255)).toString(16)).slice(-2); }).join(''); }
  function fromHex(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function hslRgb(h, s, l) {
    s /= 100; l /= 100;
    var k = function (n) { return (n + h / 30) % 12; }, a = s * Math.min(l, 1 - l);
    var f = function (n) { return 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))); };
    return [f(0), f(8), f(4)];
  }
  function rgbHsl(rgb) {
    var r = rgb[0] / 255, gg = rgb[1] / 255, b = rgb[2] / 255;
    var max = Math.max(r, gg, b), min = Math.min(r, gg, b), d = max - min, l = (max + min) / 2, h = 0, s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      h = max === r ? ((gg - b) / d) % 6 : max === gg ? (b - r) / d + 2 : (r - gg) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    return [h, s * 100, l * 100];
  }
  function cmykRgb(c, m, y, k) { k = 1 - k / 100; return [255 * (1 - c / 100) * k, 255 * (1 - m / 100) * k, 255 * (1 - y / 100) * k]; }
  function rgbCmyk(rgb) {
    var r = rgb[0] / 255, gg = rgb[1] / 255, b = rgb[2] / 255, k = 1 - Math.max(r, gg, b);
    if (k >= 1) return [0, 0, 0, 100];
    return [(1 - r - k) / (1 - k) * 100, (1 - gg - k) / (1 - k) * 100, (1 - b - k) / (1 - k) * 100, k * 100];
  }
  // The colour at grid position (u, v), both 0-1, with the sliders as they are.
  function at(u, v) {
    return mode === 'hsl' ? hslRgb(u * 360, hsl[1], 100 - v * 100) : cmykRgb(u * 100, v * 100, cmyk[2], cmyk[3]);
  }
  function draw() {
    var w = grid.width, h = grid.height, img = g.createImageData(w, h), d = img.data;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var rgb = at(x / (w - 1), y / (h - 1)), i = (y * w + x) * 4;
      d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    var u = mode === 'hsl' ? hsl[0] / 360 : cmyk[0] / 100, v = mode === 'hsl' ? 1 - hsl[2] / 100 : cmyk[1] / 100;
    g.lineWidth = 2;
    g.strokeStyle = '#000'; g.beginPath(); g.arc(u * (w - 1), v * (h - 1), 6, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = '#fff'; g.beginPath(); g.arc(u * (w - 1), v * (h - 1), 4, 0, Math.PI * 2); g.stroke();
  }
  function sliders() {
    var cm = mode === 'cmyk';
    $('mixS1Label').textContent = cm ? 'Y' : 'S';
    s1.value = Math.round(cm ? cmyk[2] : hsl[1]); $('mixS1Val').textContent = s1.value;
    $('mixS2Row').hidden = !cm;
    s2.value = Math.round(cmyk[3]); $('mixS2Val').textContent = s2.value;
    box.querySelectorAll('[data-mix-mode]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-mix-mode') === mode); });
  }
  // Recomputes the hex from the grid and sliders, or (from = 'hex' or 'typing') the grid and sliders from the hex.
  // While typing, the hex box is left as typed.
  function update(from) {
    var fromHexValue = from === 'hex' || from === 'typing';
    if (fromHexValue) { var rgb = fromHex(hex); var h = rgbHsl(rgb); if (h[1] > 0.5) hsl[0] = h[0]; hsl[1] = h[1]; hsl[2] = h[2]; cmyk = rgbCmyk(rgb); }
    else hex = toHex(mode === 'hsl' ? hslRgb(hsl[0], hsl[1], hsl[2]) : cmykRgb(cmyk[0], cmyk[1], cmyk[2], cmyk[3]));
    if (!fromHexValue) {   // keep the other model in step, so switching tabs shows the same colour
      var rgb2 = fromHex(hex);
      if (mode === 'hsl') cmyk = rgbCmyk(rgb2); else { var h2 = rgbHsl(rgb2); if (h2[1] > 0.5) hsl[0] = h2[0]; hsl[1] = h2[1]; hsl[2] = h2[2]; }
    }
    if (from !== 'typing') hexIn.value = hex;
    $('mixSwatch').style.background = hex;
    sliders();
    draw();
  }
  function pickAt(e) {
    var r = grid.getBoundingClientRect();
    var u = clamp((e.clientX - r.left) / r.width, 0, 1), v = clamp((e.clientY - r.top) / r.height, 0, 1);
    if (mode === 'hsl') { hsl[0] = u * 360; hsl[2] = 100 - v * 100; } else { cmyk[0] = u * 100; cmyk[1] = v * 100; }
    update();
  }
  var dragging = false;
  grid.addEventListener('pointerdown', function (e) { e.preventDefault(); dragging = true; try { grid.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } pickAt(e); });
  grid.addEventListener('pointermove', function (e) { if (dragging) pickAt(e); });
  grid.addEventListener('pointerup', function () { dragging = false; });
  grid.addEventListener('pointercancel', function () { dragging = false; });
  s1.addEventListener('input', function () { if (mode === 'hsl') hsl[1] = +s1.value; else cmyk[2] = +s1.value; update(); });
  s2.addEventListener('input', function () { cmyk[3] = +s2.value; update(); });
  box.querySelectorAll('[data-mix-mode]').forEach(function (b) {
    b.addEventListener('click', function () { mode = b.getAttribute('data-mix-mode'); update(); });
  });
  hexIn.addEventListener('input', function () {
    var v = hexIn.value.trim(); if (v[0] !== '#') v = '#' + v;
    if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
    if (SK.isHex(v)) { hex = v.toLowerCase(); update('typing'); }
  });
  hexIn.addEventListener('keydown', function (e) {
    e.stopPropagation();   // typing a hex must not trigger the sheet's shortcut keys
    if (e.key === 'Enter') { e.preventDefault(); use(); }
    if (e.key === 'Escape') show(false);
  });
  function use() {
    pen.custom = hex;
    colorPicker.open(false);
    pen.color = hex; savePen(); renderPen(); if (tool === 'select') setTool('draw');
  }
  $('mixUse').addEventListener('click', use);
  // Opens beside the colour rows, kept on screen.
  function show(on) {
    box.hidden = !on;
    $('colorMixBtn').setAttribute('aria-expanded', on ? 'true' : 'false');
    $('colorMixBtn').classList.toggle('on', on);
    if (!on) return;
    hex = pen.custom; update('hex');
    var row = document.querySelector('#colorPicker .pick-row').getBoundingClientRect();
    var bw = box.offsetWidth, bh = box.offsetHeight;
    var left = row.right + 8, top = row.top;
    if (left + bw > window.innerWidth - 8) left = Math.max(8, row.left);
    if (left !== row.right + 8) top = row.bottom + 8;
    top = clamp(top, 8, Math.max(8, window.innerHeight - bh - 8));
    box.style.left = left + 'px'; box.style.top = top + 'px';
  }
  return { show: show, hslRgb: hslRgb, cmykRgb: cmykRgb, toHex: toHex };
})();
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
// Shows whether underlays are on, on the left bar.
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
// Shows the current dimension type on the left bar.
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
// Puts every tool moved to the overflow column back on the left bar.
function railHome() {
  while (railMoved.length) { var m = railMoved.pop(); m.slot.parentNode.replaceChild(m.unit, m.slot); }
}
// Hides tool groups that are left empty.
function railTidy() {
  document.querySelectorAll('#lrail .lgroup.tools').forEach(function (g) { g.hidden = !g.querySelector('.tool'); });
}
// Opens or closes the overflow column, beside the bar's bottom edge.
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
// Moves the tools that do not fit on the left bar into the overflow column, from the bottom up.
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
  else if (act === 'files') window.open('files.html', '_blank', 'noopener');   // a page of links, not a panel
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
