// Quick Detail app — Library page.
// Ratings, the header menus, the library list (sort, filter, search), catalogue cards, and hold-to-flip frames.
// Part of the app split across sketch/app/*.js. The parts share the page's global scope, so load order matters:
// see the <script> list in index.html and docs/code-map/index.html.
'use strict';

// ---- Ratings: 0 to 5 stars. A new detail starts at 1. Tap a star to set it; tap the top star again for 0. ----
function ratingOf(d) { return d.rating == null ? 1 : d.rating; }
// A rating as five stars, filled and empty.
function starsText(n) { var out = ''; for (var i = 1; i <= 5; i++) out += i <= n ? '★' : '☆'; return out; }

// Sets the rating on the cloud copy (when there is one) and on the local copy. The open detail is saved through saveNow.
function setRating(d, n, fromCloud) {
  function local() {
    return SK.DB.get('details', d.id).then(function (mine) {
      if (detail && detail.id === d.id) { detail.rating = n; return saveNow(); }
      if (!mine) return;
      mine.rating = n;
      return SK.DB.put('details', mine).then(function () { cacheDetail(mine); });
    });
  }
  var job = fromCloud && d.cloud ? SK.Cloud.setRating(d.cloud.id, n).then(local) : local();
  return job.then(function () { d.rating = n; lib.cloudRows = null; renderLibrary(); })
    .catch(function (e) { fail(e, 'Could not set the rating: '); });
}

// Five stars in the info popup. Tapping a star sets the rating; tapping the top star again clears it to 0.
function ratingRow(d, fromCloud) {
  var row = el('div', { class: 'stars', role: 'group', 'aria-label': 'Rating' });
  function draw() {
    var n = ratingOf(d);
    row.innerHTML = '';
    for (var i = 1; i <= 5; i++) {
      (function (i) {
        var label = i + (i === 1 ? ' star' : ' stars');
        row.appendChild(el('button', { class: 'star' + (i <= n ? ' on' : ''), text: i <= n ? '★' : '☆', title: label, 'aria-label': label,
          'aria-pressed': String(i <= n), on: { click: function () {
            setRating(d, i === n ? 0 : i, fromCloud).then(draw);
          } } }));
      })(i);
    }
    row.appendChild(el('span', { class: 'muted', text: n + (n === 1 ? ' star' : ' stars') }));
  }
  draw();
  return row;
}

// ---- Header menus: the sort (⇅) and the + (tags and card background) menus open one at a time ----
function closeMenus() {
  ['libSortMenu', 'libMore'].forEach(function (id) { $(id).hidden = true; });
  ['libSortBtn', 'libMoreBtn'].forEach(function (id) { $(id).setAttribute('aria-expanded', 'false'); });
}
// Opens one header menu and closes the other.
function toggleMenu(btnId, menuId) {
  var open = $(menuId).hidden;
  closeMenus();
  $(menuId).hidden = !open;
  $(btnId).setAttribute('aria-expanded', String(open));
}

// Library page: every detail with its tags and metadata. Sort, filter by tag, and hold a card to flip through its scenes.

var lib = { sessions: {}, frames: {}, view: 'local', query: '', filters: [] };   // filters: tags picked; a detail must have all of them

// How many scenes a detail's recordings have.
function sceneCountOf(d) { return SK.scenesOf(lib.sessions[d.id] || []).length; }

// A detail's tags: the ones typed on it.
// Element tags (from speech and shape) are not tags: they are listed on the Edit tags page.
function detailTags(d) { return (d.tags || []).slice(); }

// Opens the library page, on All, sorted by last edited.
function openLibrary() {
  closePanel();
  if (pb) exitReplay();
  lib.frames = {};
  lib.cloudRows = null;   // the cloud list is read once per visit; search and filters reuse it
  lib.filters = [];       // every visit starts on All, sorted by last edited
  $('libSort').value = 'recent';
  $('libPage').hidden = false;
  document.querySelector('.rail [data-act="library"]').classList.add('on');
  renderLibrary();
}

// Closes the library page.
function closeLibrary() {
  $('libPage').hidden = true;
  document.querySelector('.rail [data-act="library"]').classList.remove('on');
}

// Whether a detail matches the search: name, scale, tags or words said.
function matchesQuery(d, q) {
  var words = SK.scenesOf(lib.sessions[d.id] || []).map(function (s) { return s.text; }).join(' ');
  return [d.name, d.scale, detailTags(d).join(' '), words].join(' ').toLowerCase().indexOf(q) >= 0;
}

// Marks the current view, sort and card background in the header.
function setLibraryTabs() {
  document.querySelectorAll('#libPage [data-view]').forEach(function (b) {
    b.classList.toggle('on', b.getAttribute('data-view') === lib.view);
  });
  document.querySelectorAll('#libSortMenu [data-sort]').forEach(function (b) {
    b.classList.toggle('on', b.getAttribute('data-sort') === $('libSort').value);
  });
  document.querySelectorAll('#libBg [data-bg]').forEach(function (b) {
    b.classList.toggle('on', b.getAttribute('data-bg') === (settings.libBg || 'sheet'));
  });
}

// Draws the library for the current view: this browser, the cloud or the bin.
function renderLibrary() {
  setLibraryTabs();
  if (lib.view === 'cloud') return renderCloud();
  if (lib.view === 'bin') return renderBin();
  Promise.all([SK.DB.all('details'), SK.DB.all('sessions')]).then(function (r) {
    lib.sessions = {};
    r[1].forEach(function (s) { (lib.sessions[s.detailId] = lib.sessions[s.detailId] || []).push(s); });
    setDetails(r[0]);
    showDetails(r[0].filter(function (d) { return !d.deletedAt; }), libCard, null, 'No details yet. Draw something, or tap New detail.');
  }).catch(function (e) { fail(e, 'Could not read the library: '); });
}

// Dates as the cards and the info panel show them.
function dateOf(t) { return new Date(t).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }
// Edited and created dates, as one line.
function editedLine(d) { return 'Edited ' + dateOf(d.modified) + (d.created ? ' · Created ' + dateOf(d.created) : ''); }

// Both views list details the same way: one flat list, sorted, filtered by tags and search. lead goes on top.
function showDetails(details, card, lead, empty) {
  var sort = $('libSort').value;
  details.sort(function (a, b) {
    if (sort === 'recent') return b.modified - a.modified || a.name.localeCompare(b.name);
    if (sort === 'created') return (b.created || 0) - (a.created || 0) || a.name.localeCompare(b.name);
    if (sort === 'rating') return ratingOf(b) - ratingOf(a) || a.name.localeCompare(b.name);
    if (sort === 'scenes') return sceneCountOf(b) - sceneCountOf(a) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });

  var tags = [];
  details.forEach(function (d) { detailTags(d).forEach(function (t) { if (tags.indexOf(t) < 0) tags.push(t); }); });
  tags.sort();
  var filters = $('libFilters');
  filters.innerHTML = '';
  filters.appendChild(el('button', { class: 'chip' + (!lib.filters.length ? ' on' : ''), text: 'All', on: { click: function () { lib.filters = []; renderLibrary(); } } }));
  tags.forEach(function (t) {
    var picked = lib.filters.indexOf(t) >= 0;
    filters.appendChild(el('button', { class: 'chip' + (picked ? ' on' : ''), text: t, 'aria-pressed': String(picked), on: { click: function () {
      lib.filters = picked ? lib.filters.filter(function (x) { return x !== t; }) : lib.filters.concat([t]);
      renderLibrary();
    } } }));
  });

  var q = (lib.query || '').trim().toLowerCase();
  var shown = details.filter(function (d) {
    var own = detailTags(d);
    return lib.filters.every(function (t) { return own.indexOf(t) >= 0; }) && (!q || matchesQuery(d, q));
  });
  var body = $('libBody');
  body.innerHTML = '';
  if (lead) body.appendChild(lead);
  if (!shown.length) { body.appendChild(el('p', { class: 'muted', text: q || lib.filters.length ? 'Nothing matches.' : empty })); return; }

  // Not grouped by tag: a tag splits the list, so the order by last edited would no longer read down the page.
  var grid = el('div', { class: 'lib-grid' });
  shown.forEach(function (d) { grid.appendChild(card(d)); });
  body.appendChild(grid);
}

// Library cards as drawn on the sheet, in colour on white, or black only on white.
function libColors() {
  if (settings.libBg === 'white' || settings.libBg === 'mono') return { ink: '#111111', paper: '#ffffff', mono: settings.libBg === 'mono' };
  var c = colors();
  return { ink: c.ink, paper: c.paper, mono: false };
}

// A card shows what prints: underlays are left out, and the picture is framed on the printed part.
function cardPicture(items, b, a, col) {
  return SK.picture(visible(SK.printable(items)), b, 220, 140, { ac: a, ink: col.ink, paper: col.paper, mono: col.mono, print: true });
}
// The bounds a card frames: the printable items, or all of them when nothing prints.
function cardBounds(items, a) { return SK.itemsBounds(visible(SK.printable(items)), a) || SK.itemsBounds(visible(items), a); }

// The catalogue card: the picture, the title, and one line that follows the sort (date, rating, tags or scene count).
// Holding it previews the scenes. Tapping it opens the detail's card. The × deletes it (to the bin).
function cardInfo(d) {
  var sort = $('libSort').value;
  var sess = lib.sessions[d.id] || [];
  if (sort === 'created') return 'Created ' + dateOf(d.created);
  if (sort === 'rating') return starsText(ratingOf(d)) + ' ' + ratingOf(d) + '/5';
  if (sort === 'name') return detailTags(d).join(' · ') || 'no tags yet';
  if (sort === 'scenes' && lib.view !== 'cloud') { var n = SK.scenesOf(sess).length; return n + (n === 1 ? ' scene' : ' scenes'); }
  return 'Edited ' + dateOf(d.modified);
}

// A library card: picture, title and one line that follows the sort. Hold to flip, tap for the popup, × to bin.
function catalogueCard(d, fromCloud) {
  var a = acFor(d), col = libColors();
  var pic = cardPicture(d.items, cardBounds(d.items, a), a, col);
  SK.whenImages(visible(d.items)).then(function () {   // an image may load after the card is drawn
    var again = cardPicture(d.items, cardBounds(d.items, a), a, col);
    if (!pic.parentNode || pic.parentNode.classList.contains('flipping')) return;
    pic.getContext('2d').drawImage(again, 0, 0);
  });
  var del = el('button', { class: 'lib-del', text: '×', title: fromCloud ? 'Move to the cloud recycle bin' : 'Delete from this browser',
    'aria-label': (fromCloud ? 'Move ' + d.name + ' to the cloud recycle bin' : 'Delete ' + d.name), on: { click: function (e) {
      e.stopPropagation();
      if (fromCloud) deleteFromCloud(d); else removeDetail(d);
    } } });
  var card = el('article', { class: 'lib-card' + (d.id === detail.id ? ' on' : ''), role: 'button', tabindex: '0' }, [
    del,
    pic,
    el('span', { class: 'flip-label' }),
    el('b', { text: d.name }),
    el('span', { class: 'meta info-line', text: cardInfo(d) })
  ]);
  bindFlip(card, pic, d);   // hold to preview, as before
  card.addEventListener('click', function () {
    if (Date.now() < card._quietUntil) return;   // the click that follows a hold must not open the card
    showDetailInfo(d, fromCloud);
  });
  card.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); showDetailInfo(d, fromCloud); } });
  return card;
}
// A card for a detail in this browser.
function libCard(d) { return catalogueCard(d, false); }
// A card for a cloud detail.
function cloudCard(d) { return catalogueCard(d, true); }

// A cloud detail becomes a local copy the first time it is duplicated or inserted as a block, since both need it on this device.
function localCopyOf(d) {
  return SK.DB.get('details', d.id).then(function (mine) {
    if (mine) return mine;
    var copy = { id: d.id, name: d.name, scale: d.scale, tags: d.tags || [], items: d.items || [], parentId: null, created: d.created, modified: d.modified, rating: d.rating };
    return saveDetail(copy, [], null).then(function () { return copy; });
  });
}

// Frames for flipping: one picture per scene, all at the same view so they line up.
// A detail with no recordings builds up instead: up to 12 steps, from the first items to the whole drawing.
function buildUpFrames(d, a, col) {
  var items = d.items || [];
  if (items.length < 2) return [];
  var b = cardBounds(items, a);
  var steps = Math.min(12, items.length), out = [];
  for (var i = 1; i <= steps; i++) {
    var n = Math.ceil(items.length * i / steps);
    out.push({ canvas: cardPicture(items.slice(0, n), b, a, col), label: 'Drawing · ' + n + ' of ' + items.length });
  }
  return out;
}

// One picture per scene for flipping and GIFs, all framed alike. Cached per visit.
function framesFor(d) {
  var key = (d.cloud ? 'cloud:' : 'local:') + d.id;   // a cloud detail and its local copy can differ
  if (lib.frames[key]) return Promise.resolve(lib.frames[key]);
  var sess = lib.sessions[d.id] || [];
  var bySession = {};
  var all = [];
  sess.forEach(function (s) {
    bySession[s.id] = s;
    all = all.concat(s.base);
    s.events.forEach(function (ev) {
      if (ev.type === 'put') all.push(ev.item);
      else if (ev.type === 'replace') all = all.concat(ev.items);
    });
  });
  var a = acFor(d);
  var col = libColors();
  var b = cardBounds(all, a) || cardBounds(d.items, a);
  var frames = SK.scenesOf(sess).map(function (sc) {
    return {
      canvas: cardPicture(SK.stateAt(bySession[sc.sessionId], sc.end), b, a, col),
      label: 'Scene ' + sc.index + ' · ' + SK.formatTime(sc.start)
    };
  });
  if (!frames.length) frames = buildUpFrames(d, a, col);
  lib.frames[key] = frames;
  return Promise.resolve(frames);
}

// Hold the loaded detail's card to flip through its scenes like a flip book. Release to see the detail as it is now.
function bindFlip(card, pic, d) {
  var HOLD_MS = 220, FRAME_MS = 300;
  var timer = 0, tickId = 0, frames = null, flipping = false, saved = null, idx = 0;
  var label = card.querySelector('.flip-label');
  card._quietUntil = 0;

  function show(i) {
    var c = pic.getContext('2d');
    c.clearRect(0, 0, pic.width, pic.height);
    c.drawImage(frames[i].canvas, 0, 0);
    label.textContent = frames[i].label;
  }

  function start() {
    framesFor(d).then(function (fr) {
      if (!flipping) return;
      if (!fr.length) { flipping = false; return; }
      frames = fr;
      idx = 0;
      saved = document.createElement('canvas');
      saved.width = pic.width;
      saved.height = pic.height;
      saved.getContext('2d').drawImage(pic, 0, 0);
      card.classList.add('flipping');
      show(0);
      tickId = setInterval(function () { idx = (idx + 1) % frames.length; show(idx); }, FRAME_MS);
    });
  }

  function stop() {
    clearTimeout(timer);
    clearInterval(tickId);
    if (flipping && saved) {
      pic.getContext('2d').clearRect(0, 0, pic.width, pic.height);
      pic.getContext('2d').drawImage(saved, 0, 0);
    }
    flipping = false;
    card.classList.remove('flipping');
    label.textContent = '';
    card._quietUntil = Date.now() + 400;   // the click that follows a hold must not open the detail
  }

  card.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    clearTimeout(timer);
    timer = setTimeout(function () { flipping = true; start(); }, HOLD_MS);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
    card.addEventListener(ev, function () {
      clearTimeout(timer);
      if (flipping) stop();
    });
  });
  card.addEventListener('contextmenu', function (e) { e.preventDefault(); });
}
