// Quick Detail app — Settings panel.
// Background, grid, toolbars, note capitals, dimension rounding, the version list and the change log.
// Part of the app split across sketch/app/*.js. The parts share the page's global scope, so load order matters:
// see the <script> list in index.html and docs/code-map/index.html.
'use strict';

var BACKGROUNDS = [
  { v: '#bdbdbd', l: 'Gray (default)' },
  { v: '#000000', l: 'Black' },
  { v: '#ffffff', l: 'White' },
  { v: '#f3ead7', l: 'Cream' },
  { v: '#2b3a4a', l: 'Slate' }
];

// Saves the settings to IndexedDB.
function saveSettings() { SK.DB.put('kv', settings, 'settings').catch(function () {}); }

// Redraws the Settings panel.
function refreshSettings() {
  var body = $('panelBody');
  body.innerHTML = '';
  renderSettings(body);
}

// Sets the sheet's background colour.
function setBackground(v) {
  settings.bg = v;
  saveSettings();
  redraw();
  refreshSettings();
}

// Settings → Appearance: background swatches and the grid.
function appearanceSection() {
  var swatches = BACKGROUNDS.map(function (b) {
    return el('button', { class: 'swatch' + (settings.bg === b.v ? ' on' : ''), title: b.l, 'aria-label': b.l, style: 'background:' + b.v, on: { click: function () { setBackground(b.v); } } });
  });
  var custom = el('input', { type: 'color', value: settings.bg, 'aria-label': 'Custom background colour', on: { change: function (e) { setBackground(e.target.value); } } });
  var grid = el('input', { type: 'checkbox', checked: settings.grid, on: { change: function (e) {
    settings.grid = e.target.checked;
    saveSettings();
    redraw();
  } } });
  return section('Appearance', [
    el('div', { class: 'swatches' }, swatches.concat([el('label', { class: 'swatch custom', title: 'Custom colour' }, [custom])])),
    el('label', { class: 'check' }, [grid, ' Reference grid (screen only)'])
  ]);
}

// The Settings panel.
function renderSettings(body) {
  var caps = el('input', { type: 'checkbox', checked: settings.caps, on: { change: function (e) {
    settings.caps = e.target.checked;
    saveSettings();
    redraw();
  } } });
  var round = el('select', { class: 'field', on: { change: function (e) {
    settings.roundTo = +e.target.value;
    saveSettings();
    redraw();
  } } });
  ROUNDINGS.forEach(function (r) { round.appendChild(el('option', { value: r.v, text: r.l, selected: r.v === settings.roundTo })); });

  var versions = el('ul', { class: 'versions' }, VERSIONS.map(function (v) {
    return el('li', {}, [v.href ? el('a', { href: v.href, text: v.label }) : el('b', { text: v.label }), el('span', { text: v.text })]);
  }));

  var changes = el('ul', { class: 'versions' }, CHANGES.map(function (c) {
    return el('li', {}, [el('b', { text: c[0] }), el('span', { text: c[1] })]);
  }));

  var autoCollapse = el('input', { type: 'checkbox', checked: settings.autoCollapse, on: { change: function (e) {
    settings.autoCollapse = e.target.checked;
    saveSettings();
    setCollapsed(!!sel && settings.autoCollapse);
  } } });

  [
    appearanceSection(),
    section('Toolbars', [el('label', { class: 'check' }, [autoCollapse, ' Hide toolbars while an object is selected'])]),
    section('Notes', [el('label', { class: 'check' }, [caps, ' Capitals'])]),
    section('Dimensions', [el('label', { class: 'check' }, ['Round to ', round])]),
    el('details', {}, [el('summary', { text: 'Version' }), versions]),
    el('details', {}, [el('summary', { text: 'Changes' }), changes]),
    el('details', {}, [el('summary', { text: 'Keys and touch' }),
      el('p', { class: 'muted small', text: 'T text · D dimension · H hatch · E erase · G grid · U underlays · N new scene · F fit · Ctrl+Z undo · Delete removes · Esc cancels · Space+drag pans · Ctrl+wheel zooms' }),
      el('p', { class: 'muted small', text: 'With a pen, fingers pan and zoom and only the pen draws.' })
    ])
  ].forEach(function (s) { body.appendChild(s); });
}
