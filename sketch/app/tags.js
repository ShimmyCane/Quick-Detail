// Quick Detail app — Edit tags page.
// Every tag as a panel with thumbnails. Delete or replace a tag across the library, remove element tags, and undo.
// Writes to the local copy and the cloud copy. A tag change never deletes a detail.
// Part of the app split across sketch/app/*.js. The parts share the page's global scope, so load order matters:
// see the <script> list in index.html and docs/code-map/index.html.
'use strict';

// ---- Edit tags: every tag as a panel, with thumbnails of its details. Tags sort the files; a change never deletes a detail.
// Element tags (from speech and shape) are a separate list. A change is written to the local copy and to the cloud copy
// when both exist. Undo reverses the changes made since the page was opened.
var tagEdit = { local: [], cloud: [], undo: [], sel: null, replacing: false, from: null, pick: null };

function tagSource() { return lib.view === 'cloud' ? tagEdit.cloud : tagEdit.local; }
function inTagSource(id) { return tagSource().some(function (d) { return d.id === id; }); }
function elementTagsOf(d) {
  var out = [];
  (d.items || []).forEach(function (it) {
    if (it.meta) (it.meta.tags || []).forEach(function (t) { if (out.indexOf(t) < 0) out.push(t); });
  });
  return out;
}

function loadTagSources() {
  var locals = SK.DB.all('details').then(function (l) { return l.filter(function (d) { return !d.deletedAt; }); });
  var clouds = !SK.Cloud.ready() ? Promise.resolve([]) : SK.Cloud.session().then(function (s) {
    return s ? SK.Cloud.details().then(function (rows) { return rows.map(fromCloudRow); }) : [];
  }).catch(function () { return []; });
  return Promise.all([locals, clouds]).then(function (r) { tagEdit.local = r[0]; tagEdit.cloud = r[1]; });
}

function openTags() {
  closeMenus();
  $('libPage').hidden = true;
  tagEdit.undo = [];
  tagEdit.sel = null; tagEdit.replacing = false; tagEdit.from = null; tagEdit.pick = null;
  $('tagsPage').hidden = false;
  loadTagSources().then(renderTagsPage).catch(function (e) { fail(e, 'Could not read the tags: '); });
}
function closeTags() {
  $('tagsPage').hidden = true;
  tagEdit.undo = [];
  lib.cloudRows = null;
  $('libPage').hidden = false;
  renderLibrary();
}

function renderTagsPage() {
  var src = tagSource();
  $('tagsSource').textContent = (lib.view === 'cloud' ? 'Cloud' : 'This browser') + ' · ' + src.length + (src.length === 1 ? ' detail' : ' details');
  var last = tagEdit.undo[tagEdit.undo.length - 1];
  $('tagsUndo').disabled = !last;
  $('tagsUndo').textContent = last ? 'Undo: ' + last.label : 'Undo';

  var counts = {};
  src.forEach(function (d) { (d.tags || []).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
  var list = $('tagsList');
  list.innerHTML = '';
  list.appendChild(el('h3', { text: 'Tags' }));
  var tags = Object.keys(counts).sort();
  if (!tags.length) list.appendChild(el('p', { class: 'muted', text: 'No tags yet.' }));
  tags.forEach(function (t) {
    var cls = 'chip tag-btn';
    if (tagEdit.replacing) cls += t === tagEdit.from ? ' tag-from' : ' tag-target';
    if (tagEdit.pick === t) cls += ' tag-to';
    if (!tagEdit.replacing && tagEdit.sel === t) cls += ' on';
    list.appendChild(el('button', { class: cls, text: t + ' · ' + counts[t], on: { click: function () { onTagClick(t); } } }));
  });

  var ec = {};
  src.forEach(function (d) { elementTagsOf(d).forEach(function (t) { ec[t] = (ec[t] || 0) + 1; }); });
  list.appendChild(el('h3', { text: 'Element tags · not tags' }));
  list.appendChild(el('p', { class: 'muted small', text: 'Words and shapes the drawing picked up. Remove one to say you do not care about it, so the AI leaves it out.' }));
  var keys = Object.keys(ec).sort();
  if (!keys.length) list.appendChild(el('p', { class: 'muted small', text: 'None.' }));
  keys.forEach(function (t) {
    list.appendChild(el('div', { class: 'tag-el' }, [
      el('span', { text: t + ' · ' + ec[t] }),
      el('button', { class: 'btn small', text: 'Remove', on: { click: function () { changeTags('Remove element tag "' + t + '"', removeElementTag(t)); } } })
    ]));
  });
  renderTagPanel();
}

function onTagClick(t) {
  if (tagEdit.replacing) {
    if (t === tagEdit.from) { tagEdit.replacing = false; tagEdit.from = null; tagEdit.pick = null; renderTagsPage(); return; }
    tagEdit.pick = t;
    renderTagsPage();
    confirmReplace(tagEdit.from, t);
    return;
  }
  tagEdit.sel = tagEdit.sel === t ? null : t;
  renderTagsPage();
}

function renderTagPanel() {
  var panel = $('tagsPanel');
  panel.innerHTML = '';
  if (tagEdit.replacing) {
    panel.appendChild(el('p', { text: 'Replace "' + tagEdit.from + '" with…' }));
    panel.appendChild(el('p', { class: 'muted', text: 'Tap the tag to put in its place. Tap "' + tagEdit.from + '" again to cancel. A detail that has both keeps one.' }));
    return;
  }
  var t = tagEdit.sel;
  if (!t) { panel.appendChild(el('p', { class: 'muted', text: 'Tap a tag to see its details here.' })); return; }
  var items = tagSource().filter(function (d) { return (d.tags || []).indexOf(t) >= 0; });
  panel.appendChild(el('div', { class: 'row' }, [
    el('b', { text: t }),
    el('span', { class: 'muted', text: items.length + (items.length === 1 ? ' detail' : ' details') })
  ]));
  panel.appendChild(el('div', { class: 'row' }, [
    el('button', { class: 'btn', text: 'Replace tag…', on: { click: function () { tagEdit.replacing = true; tagEdit.from = t; tagEdit.pick = null; renderTagsPage(); } } }),
    el('button', { class: 'btn danger', text: 'Delete tag', on: { click: function () { confirmDeleteTag(t, items.length); } } })
  ]));
  panel.appendChild(el('div', { class: 'tag-thumbs' }, items.map(tagThumb)));
}

function tagThumb(d) {
  var a = acFor(d), col = libColors();
  var pic = cardPicture(d.items, cardBounds(d.items, a), a, col);
  pic.className = 'tag-thumb-pic';
  return el('figure', { class: 'tag-thumb' }, [pic, el('figcaption', { text: d.name })]);
}

// A confirm box over the page. Cancel is the safe choice, so it has focus.
function popup(title, body, okText, onOk, onCancel) {
  var back = null;
  function close() { if (back) back.remove(); }
  var card = el('div', { class: 'pop-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
    el('b', { text: title }),
    el('p', { class: 'muted', text: body }),
    el('div', { class: 'row' }, [
      el('button', { class: 'btn danger', text: okText, on: { click: function () { close(); onOk(); } } }),
      el('button', { class: 'btn', text: 'Cancel', on: { click: function () { close(); if (onCancel) onCancel(); } } })
    ])
  ]);
  back = el('div', { class: 'pop-back' }, [card]);
  document.body.appendChild(back);
  card.querySelector('.row .btn:last-child').focus();
}

function confirmDeleteTag(t, n) {
  popup('Delete tag "' + t + '"?',
    'It is taken off ' + n + (n === 1 ? ' detail' : ' details') + '. The details themselves stay. Undo lasts until this page closes.',
    'Delete tag', function () { tagEdit.sel = null; changeTags('Delete tag "' + t + '"', deleteTag(t)); });
}
function confirmReplace(a, b) {
  popup('Replace tag "' + a + '" with "' + b + '"?',
    'Every detail with "' + a + '" gets "' + b + '" instead. A detail that has both keeps one. Undo lasts until this page closes.',
    'Replace', function () {
      tagEdit.replacing = false; tagEdit.from = null; tagEdit.pick = null; tagEdit.sel = null;   // back to the first panel
      changeTags('Replace "' + a + '" with "' + b + '"', replaceTag(a, b));
    },
    function () { tagEdit.pick = null; renderTagsPage(); });
}

// The three changes. Each returns the new { tags, items } for one copy of a detail, or null when it is unchanged.
function deleteTag(t) {
  return function (rec) {
    var tags = rec.tags || [];
    if (tags.indexOf(t) < 0) return null;
    return { tags: tags.filter(function (x) { return x !== t; }), items: rec.items || [] };
  };
}
function replaceTag(a, b) {
  return function (rec) {
    var tags = rec.tags || [];
    if (tags.indexOf(a) < 0) return null;
    var out = [];
    tags.forEach(function (x) { var y = x === a ? b : x; if (out.indexOf(y) < 0) out.push(y); });
    return { tags: out, items: rec.items || [] };
  };
}
function removeElementTag(t) {
  return function (rec) {
    var hit = false;
    var items = clone(rec.items || []).map(function (it) {
      if (it.meta && (it.meta.tags || []).indexOf(t) >= 0) {
        hit = true;
        it.meta.tags = it.meta.tags.filter(function (x) { return x !== t; });
      }
      return it;
    });
    return hit ? { tags: (rec.tags || []).slice(), items: items } : null;
  };
}

// Applies a change to every copy of the details on this page, and keeps it for undo.
function changeTags(label, transform) {
  var entries = [];
  tagEdit.local.concat(tagEdit.cloud).forEach(function (rec) {
    if (!inTagSource(rec.id)) return;
    var next = transform(rec);
    if (!next) return;
    entries.push({
      store: rec.cloud ? 'cloud' : 'local', id: rec.id, cloudId: rec.cloud ? rec.cloud.id : null,
      before: { tags: (rec.tags || []).slice(), items: clone(rec.items || []) }, after: next
    });
  });
  if (!entries.length) { toast('Nothing to change.'); return; }
  writeTagEntries(entries, 'after').then(function () {
    tagEdit.undo.push({ label: label, entries: entries });
    lib.cloudRows = null;
    loadTagSources().then(renderTagsPage);
    toast(label + ': ' + entries.length + (entries.length === 1 ? ' copy' : ' copies') + ' changed.');
  }).catch(function (e) { fail(e, 'Could not change the tags: '); });
}

function undoTagEdit() {
  var last = tagEdit.undo[tagEdit.undo.length - 1];
  if (!last) return;
  writeTagEntries(last.entries, 'before').then(function () {
    tagEdit.undo.pop();
    lib.cloudRows = null;
    loadTagSources().then(renderTagsPage);
    toast('Undid: ' + last.label + '.');
  }).catch(function (e) { fail(e, 'Could not undo: '); });
}

// Writes one set of entries, the 'before' or the 'after' values, one copy at a time.
function writeTagEntries(entries, key) {
  return entries.reduce(function (p, e) {
    return p.then(function () {
      var v = e[key];
      if (e.store === 'cloud') return SK.Cloud.setTagsItems(e.cloudId, v.tags, clone(v.items));
      if (detail && detail.id === e.id) {   // the open detail is saved through the editor's own path
        detail.tags = v.tags.slice();
        detail.items = clone(v.items);
        detail.modified = Date.now();
        return saveNow();
      }
      return SK.DB.get('details', e.id).then(function (mine) {
        if (!mine) return;
        mine.tags = v.tags.slice();
        mine.items = clone(v.items);
        mine.modified = Date.now();
        return SK.DB.put('details', mine).then(function () { cacheDetail(mine); });
      });
    });
  }, Promise.resolve());
}
