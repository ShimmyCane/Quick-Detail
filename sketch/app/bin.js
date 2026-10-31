// Quick Detail app — Recycle bin (this browser).
// Moving a detail to the bin, restoring it, deleting it for good, and the bin view.
// Part of the app split across sketch/app/*.js. The parts share the page's global scope, so load order matters:
// see the <script> list in index.html and docs/code-map/index.html.
'use strict';

// Delete from the library. The detail goes to the recycle bin, where it can be restored until the bin is emptied.
function removeDetail(d) {
  if (d.id === detail.id) { closeLibrary(); deleteDetail(); return; }
  confirmDelete(d, function () { moveToBin(d); });
}

// Asks before a detail goes to the bin. "Don't ask for 5 minutes" skips the question until the time is up.
function confirmDelete(d, go) {
  confirmBin('recycle bin', 'Its recordings go with it. You can restore it from Library → Recycle bin until you empty the bin.', d, go);
}

// The move-to-bin question, for this browser's bin and the cloud bin. The 5-minute quiet time is shared by both.
// Cancel is the safe choice, so it has focus.
function confirmBin(where, body, d, go) {
  if (Date.now() < recycleQuietUntil) { go(); return; }
  var back = null;
  function close() { if (back) back.remove(); }
  var card = el('div', { class: 'pop-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Move to the ' + where }, [
    el('b', { text: 'Move "' + d.name + '" to the ' + where + '?' }),
    el('p', { class: 'muted', text: body }),
    el('div', { class: 'row' }, [
      el('button', { class: 'btn danger', text: 'Move to bin', on: { click: function () { close(); go(); } } }),
      el('button', { class: 'btn', text: 'Don\'t ask for 5 minutes', on: { click: function () {
        recycleQuietUntil = Date.now() + 5 * 60 * 1000;
        close();
        go();
      } } }),
      el('button', { class: 'btn', text: 'Cancel', on: { click: close } })
    ])
  ]);
  back = el('div', { class: 'pop-back' }, [card]);
  document.body.appendChild(back);
  card.querySelector('.row .btn:last-child').focus();
}

// Marks a detail deleted (deletedAt), so it shows in the recycle bin only.
function moveToBin(d) {
  d.deletedAt = Date.now();
  SK.DB.put('details', d).then(function () {
    cacheDetail(d);
    toast('Moved "' + d.name + '" to the recycle bin.');
    renderLibrary();
  }).catch(function (e) { fail(e, 'Could not delete: '); });
}

// Takes a detail out of the recycle bin.
function restoreDetail(d) {
  d.deletedAt = null;
  SK.DB.put('details', d).then(function () {
    cacheDetail(d);
    toast('Restored "' + d.name + '".');
    renderBin();
  }).catch(function (e) { fail(e, 'Could not restore: '); });
}

// Deletes a detail and its recordings for good. Used by the recycle bin only.
function purgeDetail(d) {
  return SK.DB.sessionsOf(d.id)
    .then(function (list) { return Promise.all(list.map(function (s) { return SK.DB.del('sessions', s.id); })); })
    .then(function () { return SK.DB.del('details', d.id); })
    .then(function () { uncache(d.id); });
}

// Deletes every detail in the bin for good, after a confirm.
function emptyBin(gone) {
  if (!window.confirm('Empty the recycle bin? ' + gone.length + (gone.length === 1 ? ' detail and its recordings' : ' details and their recordings') + ' will be deleted for good.')) return;
  gone.reduce(function (p, d) { return p.then(function () { return purgeDetail(d); }); }, Promise.resolve())
    .then(function () { toast('The recycle bin is empty.'); renderBin(); })
    .catch(function (e) { fail(e, 'Could not empty the bin: '); });
}

// The recycle bin: deleted details wait here. Nothing in it shows in the library.
function renderBin() {
  $('libFilters').innerHTML = '';
  var body = $('libBody');
  SK.DB.all('details').then(function (list) {
    var gone = list.filter(function (d) { return d.deletedAt; }).sort(function (a, b) { return b.deletedAt - a.deletedAt; });
    body.innerHTML = '';
    body.appendChild(el('div', { class: 'row bin-head' }, [
      el('p', { class: 'muted', text: gone.length
        ? gone.length + (gone.length === 1 ? ' detail' : ' details') + ' in the bin. Restore them, or empty the bin to delete them for good.'
        : 'The bin is empty. Details you delete wait here until you empty the bin.' }),
      gone.length ? el('button', { class: 'btn danger', text: 'Empty recycle bin', on: { click: function () { emptyBin(gone); } } }) : null
    ]));
    gone.forEach(function (d) {
      body.appendChild(el('article', { class: 'bin-row' }, [
        el('b', { text: d.name }),
        el('span', { class: 'muted', text: 'Deleted ' + new Date(d.deletedAt).toLocaleString() + ' · ' + d.items.length + ' elements' }),
        el('div', { class: 'row' }, [
          el('button', { class: 'btn', text: 'Restore', on: { click: function () { restoreDetail(d); } } }),
          el('button', { class: 'btn danger', text: 'Delete for good', on: { click: function () {
            if (window.confirm('Delete "' + d.name + '" and its recordings for good? This cannot be undone.')) purgeDetail(d).then(renderBin).catch(function (e) { fail(e, 'Could not delete: '); });
          } } })
        ])
      ]));
    });
    renderCloudBin(body);
  }).catch(function (e) { fail(e, 'Could not read the bin: '); });
}
