// Quick Detail app — Save as, branches and blocks.
// Save as, branch from a scene, merge into the parent, blocks (insert, open source, copy in,
// checklist, pop-up, branch as new version), and deleting the open detail.
// Part of the app split across sketch/app/*.js. The parts share the page's global scope, so load order matters:
// see the <script> list in index.html and docs/code-map/index.html.
'use strict';

// ---- save as, branch, merge, delete ----

function copySessions(fromList, toId) {
  return Promise.all(fromList.map(function (s) {
    var c = Object.assign({}, s, { id: uid('r'), detailId: toId });
    delete c._scenes;
    return SK.DB.put('sessions', c);
  }));
}

function saveAs() {
  var name = window.prompt('Save as', detail.name + ' copy');
  if (!name) return;
  stopRecording().then(function () {
    var d = newDetail(name.trim());
    d.scale = detail.scale;
    d.tags = detail.tags.slice();
    d.items = clone(detail.items);
    d.parentId = detail.parentId;
    d.fork = detail.fork || null;
    return SK.DB.put('details', d)
      .then(function () { return copySessions(sessions, d.id); })
      .then(function () { closePanel(); toast('Saved as ' + d.name + ', with its scenes.'); return openDetail(d); });
  }).catch(fail);
}

// fork: { step } where it branched from, the number of the scene in this lane (see sketch/lanes.js).
function branchFrom(items, label, fork) {
  stopRecording().then(function () {
    var d = newDetail(detail.name + ' — ' + label);
    d.scale = detail.scale;
    d.tags = detail.tags.slice();
    d.items = clone(items);
    d.parentId = detail.id;
    d.fork = fork ? { step: fork.step } : null;
    return SK.DB.put('details', d).then(function () {
      closePanel();
      toast('Branched. Edit freely; merge back from Project info.');
      return openDetail(d);
    });
  }).catch(fail);
}

function mergeIntoParent() {
  SK.DB.get('details', detail.parentId).then(function (p) {
    if (!p) { toast('The parent detail was deleted.'); return; }
    if (!window.confirm('Merge this branch into "' + p.name + '"? Its items are added there, and items changed here replace the old ones.')) return;
    var merged = clone(p.items);
    detail.items.forEach(function (it) {
      var i = indexOf(merged, it.id);
      if (i >= 0) merged[i] = clone(it); else merged.push(clone(it));
    });
    p.items = merged;
    p.modified = Date.now();
    return SK.DB.put('details', p).then(function () { toast('Merged into ' + p.name + '.'); });
  }).catch(fail);
}

// ---- blocks: a finished detail placed inside this one ----

// A block is a detail's own underlay: faint, at 40% opacity, scale 100%, left out of prints. Null (with a reason) when it cannot go here.
function makeBlock(src) {
  var refusal = SK.blockRefusal(detail.id, detail.items, src.id, sourceOf);
  if (refusal) { toast(refusal); return null; }
  var b = SK.itemsBounds(SK.flattenItems(src.items || [], sourceOf), acFor(src));
  if (!b) { toast(src.name + ' has no lines yet.'); return null; }
  var mid = SK.toWorld(view, [W() / 2, H() / 2]);
  return { id: uid('b'), kind: 'block', sourceId: src.id, at: [mid[0] - (b.minx + b.maxx) / 2, mid[1] - (b.miny + b.maxy) / 2], k: 1, opacity: 0.4, print: false };
}

// Places a block of src at the centre of the view, so it lands where you are looking.
function addBlock(src) {
  var item = makeBlock(src);
  if (!item) return;
  closePanel();
  commitPut(item, null);
  select(item.id);
  toast('Block added. Draw over it freely. Use the arrow tool to move it, or its chips to scale and fade it.');
}

// A block detail is named Block_… (Block_door, Block_roof, Block_hatch), or tagged block.
function isBlockDetail(d) {
  return /^block_/i.test(d.name || '') || (d.tags || []).indexOf('block') >= 0;
}

// Opens the block's detail for editing. Its blocks then show the pop-up, and Branch can repoint this one.
function openSource(bk) {
  var from = detail.id;
  SK.DB.get('details', bk.sourceId).then(function (src) {
    if (!src) { toast('That detail is not on this device.'); return; }
    closePanel();
    return openDetail(src, from);
  }).catch(fail);
}

// Replaces a block with plain copies of its lines, so this detail can change them without touching the source.
function copyInBlock(bk) {
  var i = indexOf(detail.items, bk.id);
  if (i < 0) return;
  var copies = SK.copyInBlock(bk, sourceOf, function () { return uid('i'); });
  sel = null;
  commitReplace(detail.items.slice(0, i).concat(copies, detail.items.slice(i + 1)));
  toast('Copied in. These lines are now part of this detail only.');
}

// Blocks in this detail, and the picker that adds another finished detail as a block.
function blocksSection() {
  return blocksPicker().concat([blocksChecklist()]);
}

// Block details as a checklist, scrollable. Ticked means this detail has a block of it; unticking removes it.
function blocksChecklist() {
  var list = el('div', { class: 'block-list' });
  var libs = allDetails.filter(function (d) { return d.id !== detail.id && isBlockDetail(d); })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });
  if (!libs.length) {
    return el('p', { class: 'muted', text: 'No block details yet. Name a finished detail Block_ and its kind, for example Block_door, and it will appear here.' });
  }
  libs.forEach(function (d) {
    var box = el('input', { type: 'checkbox', 'aria-label': 'Block ' + d.name });
    box.checked = detail.items.some(function (it) { return it.kind === 'block' && it.sourceId === d.id; });
    box.addEventListener('change', function () {
      if (box.checked) {
        var item = makeBlock(d);
        if (!item) { box.checked = false; return; }
        commitPut(item, null);
        select(item.id);   // its chips appear, for scale and opacity
        return;
      }
      detail.items.filter(function (it) { return it.kind === 'block' && it.sourceId === d.id; })
        .forEach(function (it) { commitDel(it.id); });
    });
    list.appendChild(el('label', { class: 'check-row' }, [box, ' ' + d.name]));
  });
  return list;
}

function blocksPicker() {
  var here = detail.items.filter(function (it) { return it.kind === 'block'; });
  var picker = el('select', { class: 'field', 'aria-label': 'Finished detail to add as a block' });
  picker.appendChild(el('option', { value: '', text: 'Add a finished detail as a block…' }));
  allDetails
    .filter(function (d) { return d.id !== detail.id && (d.items || []).length && !SK.blockRefusal(detail.id, detail.items, d.id, sourceOf); })
    .sort(function (a, b) { return a.name.localeCompare(b.name); })
    .forEach(function (d) { picker.appendChild(el('option', { value: d.id, text: d.name })); });
  picker.addEventListener('change', function () { if (picker.value) addBlock(sourceOf(picker.value)); });
  var note = here.length
    ? here.length + (here.length === 1 ? ' block' : ' blocks') + ' in this detail. Tap one on the sheet to open its source or copy its lines in.'
    : 'No blocks yet. A block shows a finished detail here, and edits to that detail show here too.';
  var origin = detail.versionOf && sourceOf(detail.versionOf);
  return [
    origin ? el('p', { class: 'muted', text: 'A version of "' + origin.name + '". The original is unchanged.' }) : null,
    el('p', { class: 'muted', text: note }),
    picker
  ];
}

// The pop-up: shown when a detail that other details use is opened, so everyone is aware of the links.
function showBlockPopup(d, users) {
  var names = users.map(function (u) { return u.name; }).join(', ');
  var back = null;
  function close() { if (back) back.remove(); }
  var card = el('div', { class: 'pop-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Used in blocks' }, [
    el('b', { text: d.name + ' is used in ' + users.length + (users.length === 1 ? ' block' : ' blocks') }),
    el('p', { class: 'muted', text: 'Edits here change every block that uses it: ' + names + '. To keep this copy untouched, branch it as a new version.' }),
    el('div', { class: 'row' }, [
      el('button', { class: 'btn', text: 'Keep editing', on: { click: close } }),
      el('button', { class: 'btn', text: 'Branch as new version', on: { click: function () { close(); branchVersion(d); } } }),
      originHost ? el('button', { class: 'btn', text: 'Back to the detail I came from', on: { click: function () {
        close();
        SK.DB.get('details', originHost).then(function (p) { if (p) return openDetail(p); }).catch(fail);
      } } }) : null
    ])
  ]);
  back = el('div', { class: 'pop-back' }, [card]);
  document.body.appendChild(back);
  card.querySelector('.btn').focus();
}

// A new detail with the same lines, linked to the one it came from but never merged into it. The original stays as it is.
// The block this detail was opened from is pointed at the new version; other blocks keep the original.
function branchVersion(d) {
  var v = newDetail(d.name + ' — version');
  v.scale = d.scale;
  v.tags = (d.tags || []).slice();
  v.items = clone(d.items);
  v.versionOf = d.id;
  var host = originHost;
  stopRecording().then(function () {
    return host ? repointBlock(host, d.id, v.id) : null;
  }).then(function () {
    return saveDetail(v, [], null);
  }).then(function () {
    toast('Made a new version. The original is unchanged.');
    return openDetail(v);
  }).catch(fail);
}

function repointBlock(hostId, fromId, toId) {
  return SK.DB.get('details', hostId).then(function (host) {
    if (!host) return;
    var moved = false;
    host.items = host.items.map(function (it) {
      if (it.kind !== 'block' || it.sourceId !== fromId) return it;
      moved = true;
      return Object.assign({}, it, { sourceId: toId });
    });
    if (!moved) return;
    host.modified = Date.now();
    cacheDetail(host);
    return SK.DB.put('details', host);
  });
}

// The open detail goes to the recycle bin, and another detail opens in its place.
function deleteDetail() {
  confirmDelete(detail, function () {
    var gone = detail;
    stopRecording().then(function () {
      gone.deletedAt = Date.now();
      return SK.DB.put('details', gone);
    }).then(function () { cacheDetail(gone); return SK.DB.all('details'); })
      .then(function (list) {
        closePanel();
        list = list.filter(function (d) { return !d.deletedAt; }).sort(function (a, b) { return b.modified - a.modified; });
        var next = list[0] || newDetail();
        if (!list[0]) return SK.DB.put('details', next).then(function () { cacheDetail(next); return openDetail(next); });
        return openDetail(next);
      }).catch(fail);
  });
}
