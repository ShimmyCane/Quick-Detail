// Quick Detail app — Right panel and Info.
// Opening and closing the right panel, images, drawing a detail from a JSON spec, the live file box,
// and the Info (project) panel.
// Part of the app split across sketch/app/*.js. The parts share the page's global scope, so load order matters:
// see the <script> list in index.html and docs/code-map/index.html.
'use strict';

// ===================================================================
// Panels: project info, library, settings, log
// ===================================================================

// Closes the right panel or the log, and ends a replay.
function closePanel() {
  if (panelKind === 'log') $('log').hidden = true;
  else $('panel').hidden = true;
  document.body.classList.remove('panel-open');   // the left bar comes back
  panelKind = null;
  if (pb) exitReplay(); else parkPlayer();   // closing the panel ends its replay, as Done does
  document.querySelectorAll('.rail [data-act], #lrail [data-act]').forEach(function (b) {
    if (b.getAttribute('data-act') !== tool) b.classList.remove('on');
  });
}

// The replay controls live in the right panel. Off the panel they wait on the body, hidden, so the panel can be redrawn.
function parkPlayer() {
  var pl = $('player');
  if (pl.parentNode !== document.body) document.body.appendChild(pl);
  pl.hidden = true;
}

// Playback in the right panel: the replay controls, while a replay is open. Entered from the Log's Replay chip.
function renderPlayback(body) {
  if (!pb) return;
  $('player').hidden = false;
  body.appendChild($('player'));
}

// Opens a right panel: project (Info), playback, settings or log. The same one again closes it.
function openPanel(kind) {
  if (panelKind === kind) { closePanel(); return; }
  if (panelKind) closePanel();
  if (editing) closeEditor(true);
  panelKind = kind;
  var btn = document.querySelector('.rail [data-act="' + kind + '"]');
  if (btn) btn.classList.add('on');
  if (kind === 'log') { $('log').hidden = false; renderLog(); return; }
  document.body.classList.add('panel-open');   // narrow screens: the left bar steps aside (CSS)
  $('panelTitle').textContent = { project: 'Info', playback: 'Playback', settings: 'Settings' }[kind];
  var body = $('panelBody');
  body.innerHTML = '';
  $('panel').hidden = false;
  if (kind === 'project') renderProject(body);
  else if (kind === 'playback') renderPlayback(body);
  else renderSettings(body);
}

// A panel section: a heading and its contents.
function section(title, kids) {
  return el('section', {}, [el('h3', { text: title })].concat(kids));
}

// Images: placed on the no-print layer, faint on screen and left out of exports. Scaled down to keep the detail light.
var IMAGE_MAX_PX = 1600;

// Adds an image file as a no-print underlay, half the screen wide, in the middle of the view.
function addImage(file) {
  var url = URL.createObjectURL(file);
  var im = new Image();
  im.onload = function () {
    URL.revokeObjectURL(url);
    var k = Math.min(1, IMAGE_MAX_PX / Math.max(im.naturalWidth, im.naturalHeight));
    var cv = document.createElement('canvas');
    cv.width = Math.round(im.naturalWidth * k);
    cv.height = Math.round(im.naturalHeight * k);
    var c = cv.getContext('2d');
    c.fillStyle = '#fff';
    c.fillRect(0, 0, cv.width, cv.height);
    c.drawImage(im, 0, 0, cv.width, cv.height);
    // Half the screen wide, centred in the view.
    var w = Math.min(cv.width, W() * 0.5) / view.z, h = w * cv.height / cv.width;
    var mid = SK.toWorld(view, [W() / 2, H() / 2]);
    var item = {
      id: uid('i'), kind: 'image', src: cv.toDataURL('image/jpeg', 0.85), name: file.name.replace(/\.[^.]+$/, ''),
      at: [mid[0] - w / 2, mid[1] - h / 2], w: w, h: h, noPrint: true
    };
    commitPut(item, null);
    select(item.id);
    toast('Image added on the no-print layer. Draw over it freely. Use the arrow tool to move it or see its options.');
  };
  im.onerror = function () { URL.revokeObjectURL(url); toast('That file could not be read as an image.'); };
  im.src = url;
}

// Keep an image as its own library detail: printable, named, at the top-left of a new sheet.
function acceptImage(it) {
  var title = window.prompt('Title for the new detail', it.name || 'Image detail');
  if (title == null || !title.trim()) return;
  var d = newDetail(title.trim());
  d.scale = detail.scale;
  d.tags = (detail.tags || []).slice();
  d.items = [Object.assign(clone(it), { id: uid('i'), at: [0, 0], noPrint: false })];
  saveDetail(d, [], null).then(function () {
    toast('Saved "' + d.name + '" to the library.');
  }).catch(function (e) { fail(e, 'Could not save: '); });
}

// A new detail drawn from a JSON spec (see sketch/author.js). Opens it, and returns the detail.
function drawFromSpec(spec) {
  var text = typeof spec === 'string' ? spec : JSON.stringify(spec);
  var parsed = JSON.parse(text);
  var made = SK.authorDetail(parsed);
  var d = newDetail(made.name);
  d.scale = made.scale;
  d.tags = made.tags;
  d.items = made.items;
  return saveDetail(d, [], null).then(function () {
    closePanel();
    return openDetail(d);
  }).then(function () { return d; });
}

// Paste a drawing as JSON and make it a new detail. Errors say which item is wrong.
function drawBox() {
  var box = el('textarea', { class: 'field json-box', rows: '6', placeholder: '{ "name": "...", "items": [ ... ] }', 'aria-label': 'Drawing as JSON' });
  var err = el('p', { class: 'muted', text: 'Positions in inches, y down.' });
  return el('div', {}, [box, err, el('div', { class: 'row' }, [
    el('button', { class: 'btn', text: 'Create detail', on: { click: function () {
      if (!box.value.trim()) { err.textContent = 'Paste a JSON drawing first.'; return; }
      try {
        drawFromSpec(box.value).then(function (d) { toast('Drawn: ' + d.name + '.'); });
      } catch (e) {
        err.textContent = e.message;
      }
    } } })
  ])]);
}

// Keep a JSON file on this computer in step with the drawing. Choose it once; it is rewritten as you draw.
function liveBox() {
  var id = detail.id;
  if (!SK.LiveFile.supported()) {
    return el('p', { class: 'muted', text: 'A live file needs Chrome or Edge on a computer. The detail and its JSON parallel still save in this browser.' });
  }
  var note = el('p', { class: 'muted' });
  var row = el('div', { class: 'row' });
  var draw = function () {
    row.innerHTML = '';
    if (SK.LiveFile.linked(id)) {
      note.textContent = 'Keeping ' + SK.LiveFile.name(id) + ' up to date as you draw.';
      row.appendChild(el('button', { class: 'btn', text: 'Stop', on: { click: function () { SK.LiveFile.stop(id); draw(); } } }));
    } else if (SK.LiveFile.waiting(id)) {
      note.textContent = SK.LiveFile.name(id) + ' is saved from an earlier visit. Resume to keep it up to date.';
      row.appendChild(el('button', { class: 'btn', text: 'Resume', on: { click: function () {
        SK.LiveFile.resume(id).then(function (ok) { if (ok) { writeLive(id); draw(); } else toast('Permission to write the file was not given.'); });
      } } }));
    } else {
      note.textContent = 'No file chosen. Choose one, and it will hold this detail as JSON as you draw.';
      row.appendChild(el('button', { class: 'btn', text: 'Choose JSON file…', on: { click: function () {
        SK.LiveFile.choose(id, slug(detail.name) + '.live.json').then(function () { writeLive(id); draw(); }).catch(function (e) {
          if (e && e.name !== 'AbortError') toast('Could not choose the file: ' + e.message);
        });
      } } }));
    }
  };
  draw();
  return el('div', {}, [note, row]);
}

// The Info panel: New, name, scale, tags, blocks, branch, metadata, exports, file, JSON and Delete.
function renderProject(body) {
  var name = el('input', { type: 'text', value: detail.name, 'aria-label': 'Detail name', class: 'name-field', on: { input: function (e) {
    detail.name = e.target.value;
    detail.modified = Date.now();
    saveSoon();
    updateTitle();
  } } });
  var scale = el('select', { class: 'field', 'aria-label': 'Scale', on: { change: function (e) { setScale(e.target.value); } } });
  SK.SCALES.forEach(function (s) { scale.appendChild(el('option', { value: s.key, text: s.label, selected: s.key === detail.scale })); });

  var tagWrap = el('div', { class: 'tags' });
  function drawTags() {
    tagWrap.innerHTML = '';
    var all = FIXED_TAGS.concat(customTags.filter(function (t) { return FIXED_TAGS.indexOf(t) < 0; }));
    detail.tags.forEach(function (t) { if (all.indexOf(t) < 0) all.push(t); });
    all.forEach(function (t) {
      var on = detail.tags.indexOf(t) >= 0;
      tagWrap.appendChild(el('button', { class: 'chip' + (on ? ' on' : ''), text: t, 'aria-pressed': String(on), on: { click: function () {
        if (on) detail.tags = detail.tags.filter(function (x) { return x !== t; });
        else detail.tags = detail.tags.concat([t]);
        detail.modified = Date.now();
        saveSoon();
        drawTags();
      } } }));
    });
    var add = el('input', { type: 'text', placeholder: '+ tag', class: 'tag-input', 'aria-label': 'Add a custom tag', on: { keydown: function (e) {
      if (e.key !== 'Enter') return;
      var t = e.target.value.trim().toLowerCase();
      if (!t) return;
      if (customTags.indexOf(t) < 0 && FIXED_TAGS.indexOf(t) < 0) {
        customTags.push(t);
        SK.DB.put('kv', customTags, 'customTags').catch(function () {});
      }
      if (detail.tags.indexOf(t) < 0) detail.tags = detail.tags.concat([t]);
      saveSoon();
      drawTags();
    } } });
    tagWrap.appendChild(add);
  }
  drawTags();

  var branch = null;
  if (detail.parentId) {
    branch = section('Branch', [
      el('p', { class: 'muted', text: 'Merging copies its lines, notes and dimensions into the parent.' }),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn', text: 'Merge into parent', on: { click: mergeIntoParent } }),
        el('button', { class: 'btn', text: 'Open parent', on: { click: function () {
          SK.DB.get('details', detail.parentId).then(function (p) { if (p) { closePanel(); openDetail(p); } else toast('The parent detail was deleted.'); });
        } } })
      ])
    ]);
  }

  body.appendChild(el('div', { class: 'row' }, [
    el('button', { class: 'btn', text: 'New', title: 'Start a blank detail', on: { click: function () {
      var d = newDetail();
      SK.DB.put('details', d).then(function () { closePanel(); openDetail(d); });
    } } })
  ]));
  body.appendChild(name);

  [
    section('Scale', [scale]),
    section('Tags', [tagWrap]),
    section('Blocks', blocksSection()),
    branch,
    section('Metadata', [el('div', { class: 'row' }, [
      el('button', { class: 'btn', text: 'Tag elements', on: { click: tagElements } }),
      el('button', { class: 'btn', text: 'Upload to cloud', on: { click: uploadToCloud } })
    ]), el('p', { class: 'muted', text: metadataPreview() })]),
    section('Export', [el('div', { class: 'row' }, [
      el('button', { class: 'btn', text: 'JPEG', on: { click: exportJpeg } }),
      el('button', { class: 'btn', text: 'PNG', on: { click: exportPng } }),
      el('button', { class: 'btn', text: 'Scenes', on: { click: exportSeries } }),
      el('button', { class: 'btn', text: 'Data', on: { click: exportData } }),
      el('button', { class: 'btn', text: 'Parallel', on: { click: exportParallel } })
    ])]),
    section('File', [el('div', { class: 'row' }, [
      el('button', { class: 'btn', text: 'Save', on: { click: function () { saveNow().then(function () { toast('Saved.'); }).catch(fail); } } }),
      el('button', { class: 'btn', text: 'Save as…', on: { click: saveAs } })
    ])]),
    el('details', {}, [el('summary', { text: 'JSON' }), drawBox(), liveBox()]),
    el('div', { class: 'row' }, [el('button', { class: 'btn danger', text: 'Delete', on: { click: deleteDetail } })])
  ].forEach(function (s) { if (s) body.appendChild(s); });
}
