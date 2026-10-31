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

function saveSettings() { SK.DB.put('kv', settings, 'settings').catch(function () {}); }

function refreshSettings() {
  var body = $('panelBody');
  body.innerHTML = '';
  renderSettings(body);
}

function setBackground(v) {
  settings.bg = v;
  saveSettings();
  redraw();
  refreshSettings();
}

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

function renderSettings(body) {
  var caps = el('input', { type: 'checkbox', checked: settings.caps, on: { change: function (e) {
    settings.caps = e.target.checked;
    SK.DB.put('kv', settings, 'settings').catch(function () {});
    redraw();
  } } });
  var round = el('select', { class: 'field', on: { change: function (e) {
    settings.roundTo = +e.target.value;
    SK.DB.put('kv', settings, 'settings').catch(function () {});
    redraw();
  } } });
  ROUNDINGS.forEach(function (r) { round.appendChild(el('option', { value: r.v, text: r.l, selected: r.v === settings.roundTo })); });

  var versions = el('ul', { class: 'versions' }, [
    el('li', {}, [el('b', { text: 'v5 · current' }), el('span', { text: 'Playback in the right panel, compact Info, clean screen hides the title' })]),
    el('li', {}, [el('a', { href: 'history/v4/index.html', text: 'v4 · archived' }), el('span', { text: 'The app before v5, kept as it was' })]),
    el('li', {}, [el('b', { text: 'v3' }), el('span', { text: 'Endless sheet, scenes, notes, dimensions, library' })]),
    el('li', {}, [el('a', { href: 'history/v2/index.html', text: 'v2 · Wall sketch' }), el('span', { text: 'Blank sheet with recording and replay' })]),
    el('li', {}, [el('a', { href: 'history/v1/index.html', text: 'v1 · Quick Detail' }), el('span', { text: 'Detail editor with tools, meaning and exports' })])
  ]);

  // Changes, newest first. Add a line here with each change a user would notice.
  var CHANGES = [
    ['31 Oct', 'v5: clean screen also hides the title card'],
    ['31 Oct', 'Replay opens in the right panel from the Log; the ▶ rail button is archived'],
    ['31 Oct', 'Info: New at the top, the name is edited in place, JSON under its own fold'],
    ['31 Oct', 'Settings: shorter text; the version list links the archived v4'],
    ['31 Oct', 'Dimension: a left-bar picker with icons for orthographic, aligned and angular; the mode chips left the hint bar'],
    ['31 Oct', 'Scale change keeps note boxes and dimension offsets the same size on paper; one undo step'],
    ['31 Oct', 'Graphic scale: whole increments only (1", 2", 3", 6", then feet); the bar is its true length at this zoom, so its right edge moves as you zoom'],
    ['31 Oct', 'Left bar is one panel with dividers; the microphone sits on its own row above the scene button'],
    ['31 Oct', 'Small screens: tools that do not fit on the left bar move to a second column behind a + button'],
    ['31 Oct', 'Left bar tools are centred on the bar\'s centre line'],
    ['31 Oct', 'Undo: hold it to open Redo on the right, drag onto it and let go; Ctrl+Shift+Z and Ctrl+Y also redo'],
    ['31 Oct', 'Element pop-up: Duplicate, and layer order (front, forward, back, send to back) for every drawable element'],
    ['31 Oct', 'Colour and line weight: one dot each; tap or drag along the row to choose; the choice is remembered'],
    ['31 Oct', 'Reference grid on the sheet, on by default, screen only and never in exports: one true inch a square, shades of the background; every fifth line is major'],
    ['31 Oct', 'Left bar starts from the lower left corner, above the title block, and grows upwards'],
    ['31 Oct', 'Phone: a narrower left bar, with tools still easy to tap'],
    ['31 Oct', 'Graphic scale bar keeps a fixed length; its label changes from inches to feet as you zoom'],
    ['31 Oct', 'Reference grid follows the scale: a square is one printed inch and the major lines print at 5 in. x 5 in. at any scale'],
    ['31 Oct', 'Library: All and the sort are visible by default; one list sorted by last edited (or created); edited and created dates on every card'],
    ['31 Oct', 'Library cards: a compact catalogue (picture, title, one line that follows the sort). Tap a card for its info: click the picture to play the GIF, click the title to rename, × closes, and Open, Insert as block, Duplicate, PNG and GIF'],
    ['31 Oct', 'Library header: Library and Back on the first row; Local, Cloud, Recycle bin, search, sort and + on the second. Edit tags is at the top of +, above a scrollable tag list'],
    ['31 Oct', 'Edit tags page: tags as panels with thumbnails; delete and replace a tag with a confirm; element tags as their own list; undo lasts for the page'],
    ['31 Oct', 'Ratings: 0 to 5 stars on each detail, new details start at 1, and the library sorts by rating'],
    ['31 Oct', 'Library header: sort (⇅) and + menus, recycle bin and Edit tags buttons; tags are back under + and element tags are no longer tags'],
    ['31 Oct', 'Cloud recycle bin: × on each cloud card moves it to the bin, where it can be restored or deleted for good. The local copy stays'],
    ['29 Oct', 'GIF button in a detail\'s info panel, for local and cloud details: an animated GIF of its recordings'],
    ['29 Oct', 'Library: hold a card to preview it; Rename in the info panel; clearer buttons'],
    ['29 Oct', 'Starts with a visible message if the sheet fails to load (for example a stale cached script)'],
    ['29 Oct', 'Library header: Back at the top, tags under More, New detail removed'],
    ['29 Oct', 'Cloud library options, zoom to extents, 6 in. start view'],
    ['29 Oct', 'Recording, select tool, recycle bin, names, ten starter details'],
    ['29 Oct', 'Blocks: insert one detail into another as a block; branch a block as a new version'],
    ['29 Oct', 'Cloud library works like the local one; cloud details open on this device'],
    ['29 Oct', 'Images as underlays, hidden by hand; library background switch'],
    ['29 Oct', 'Roof and floor details as drawing specs'],
    ['29 Oct', 'A JSON file of each detail, with its takes, kept on disk and uploaded with cloud saves'],
    ['29 Oct', 'Library: filter by several tags at once'],
    ['29 Oct', 'Undo on the left rail; scale bar holds two grid ticks; details can be drawn from JSON'],
    ['28 Oct', 'Library: hold-to-flip on the loaded detail only'],
    ['28 Oct', 'Hatch patterns follow section conventions; tighter left rail'],
    ['28 Oct', 'Eraser, hatch patterns, yellow pen, zoom limits; no page zoom on iPad'],
    ['27 Oct', 'Cloud collections, drawing-view background and grid, pen colours and weights'],
    ['27 Oct', 'Password sign-in and password reset in the cloud sign-in form'],
    ['27 Oct', 'Cloud sync to the Architecture project; library review'],
    ['27 Oct', 'Elements tagged from speech and geometry; library page; metadata in exports']
  ];
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
