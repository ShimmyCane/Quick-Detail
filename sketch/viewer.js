// Quick Detail — the viewer: the edit history of a detail's tree, as its own page (viewer.html).
// It opens live from this browser's database, or as an exported file with the recordings inside. The same tracks,
// notes, deletes and undo work in both. Export writes one HTML file that opens anywhere, with the page code inside.
// The pure logic is in sketch/lanes.js and sketch/history.js. Runs only in the viewer page.
(function () {
  'use strict';

  var SK = window.SK;
  // The page as it was before anything was drawn. Export starts from this.
  var TEMPLATE = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
  var BUNDLE_RE = /<script type="application\/json" id="bundle">[\s\S]*?<\/script>/;
  // The page's own files: its stylesheets and scripts. Export writes each one into the file.
  var ASSET_RE = /<link rel="stylesheet" href="(sketch\/[^"]+)">|<script src="(sketch\/[^"]+)"><\/script>/g;

  var $ = function (id) { return document.getElementById(id); };
  var BG = '#fbfaf7';
  var mode = 'live';                       // 'live' reads and writes this browser's database; 'file' is an exported copy
  var data = { details: [], sessions: [] };
  var byDetail = {};
  var hist = SK.History();
  var folded = {};
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      en.target._paint();
      io.unobserve(en.target);
    });
  }, { rootMargin: '200px' }) : null;
  var boundsCache = {};

  // ---- small helpers ----

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'on') Object.keys(attrs.on).forEach(function (ev) { e.addEventListener(ev, attrs.on[ev]); });
      else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }

  var toastTimer = 0;
  function toast(msg) {
    var t = $('vToast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2800);
  }

  function slug(s) { return String(s || 'detail').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'detail'; }

  function acFor(scale) {
    return { factor: SK.scaleOf(scale).factor, caps: true, roundTo: 1 / 16, measure: SK.measure };
  }

  function ink() { return SK.inkFor('ink', BG); }

  function reindex() {
    byDetail = {};
    data.details.forEach(function (d) { byDetail[d.id] = d; });
    boundsCache = {};
  }

  // The drawable items of a list, with blocks replaced by their sources' lines.
  function visible(items) {
    return SK.flattenItems(items, function (id) { return byDetail[id] || null; });
  }

  function sessionsOf(id) {
    return data.sessions.filter(function (s) { return s.detailId === id; })
      .sort(function (a, b) { return (a.created || 0) - (b.created || 0); });
  }

  // Every scene of a lane, in order, with the recording it is in.
  function stepsOf(id) {
    var out = [];
    sessionsOf(id).forEach(function (s) {
      SK.segment(s).forEach(function (m) { out.push({ s: s, m: m }); });
    });
    return out;
  }

  // The bounds of everything a recording ever drew, for its thumbnails and playback.
  function boundsOf(s, d) {
    if (boundsCache[s.id]) return boundsCache[s.id];
    var items = (s.base || []).slice();
    (s.events || []).forEach(function (ev) {
      if (ev.type === 'put') items.push(ev.item);
      else if (ev.type === 'replace') items = items.concat(ev.items);
    });
    boundsCache[s.id] = SK.itemsBounds(visible(items), acFor(s.scale || (d && d.scale)));
    return boundsCache[s.id];
  }

  function forkText(d, labels) {
    if (!d.parentId) return 'Main line';
    var from = d.fork && d.fork.step != null ? ' · from step ' + d.fork.step : ' · fork not recorded';
    return 'Branch of ' + (labels[d.parentId] || '?') + from;
  }

  // ---- drawing ----

  function render() {
    var main = $('vMain');
    main.innerHTML = '';
    var labels = SK.laneLabels(data.details);
    var order = SK.laneOrder(data.details);
    var root = data.details.filter(function (d) { return !d.parentId; })[0] || data.details[0];
    if (!root) {
      main.appendChild(el('p', { class: 'muted', text: 'Nothing to show. Open Edit history from a detail\'s log.' }));
      return;
    }
    var total = 0;
    data.sessions.forEach(function (s) { total += SK.segment(s).length; });
    $('vTitle').textContent = root.name + ' · edit history';
    $('vSub').textContent = order.length + (order.length === 1 ? ' lane' : ' lanes') + ' · ' + total + (total === 1 ? ' scene' : ' scenes')
      + ' · ' + (mode === 'file' ? 'exported copy, saved ' + new Date(data.exported || Date.now()).toLocaleString() : 'live from this browser');
    order.forEach(function (id) { main.appendChild(laneSection(byDetail[id], labels)); });
  }

  // One lane: a header with its address, name, fork and first words, then its scenes.
  function laneSection(d, labels) {
    var steps = stepsOf(d.id);
    var first = steps.filter(function (st) { return st.m.text; })[0];
    var collapsed = !!folded[d.id];
    var head = el('header', { class: 'track-head', on: { click: function (e) {
      if (e.target.closest && e.target.closest('button')) return;
      folded[d.id] = !collapsed;
      render();
    } } }, [
      el('b', { class: 'addr', text: labels[d.id] || '?' }),
      el('div', { class: 'track-title' }, [
        el('span', { class: 'track-name', text: d.name }),
        el('span', { class: 'track-fork', text: forkText(d, labels) }),
        el('span', { class: 'track-count', text: steps.length + (steps.length === 1 ? ' scene' : ' scenes') })
      ]),
      first ? el('p', { class: 'track-desc', text: SK.firstWords(first.m.text, 14) }) : null,
      d.parentId ? el('div', { class: 'v-lane-actions' }, [
        el('button', { class: 'chip', type: 'button', text: 'Delete branch', on: { click: function () { deleteLane(d.id); } } })
      ]) : null
    ]);
    var body = el('div', { class: 'track-body' });
    if (!collapsed) {
      var strip = el('div', { class: 'strip' });
      if (!steps.length) strip.appendChild(el('p', { class: 'muted', text: 'No scenes in this lane.' }));
      steps.forEach(function (st, i) { strip.appendChild(stepCard(d, st, i + 1)); });
      body.appendChild(strip);
    }
    return el('section', { class: 'track' + (collapsed ? ' folded' : '') + (d.id === rootId() ? ' current' : ''), 'data-lane': d.id }, [head, body]);
  }

  function rootId() {
    var r = data.details.filter(function (d) { return !d.parentId; })[0];
    return r ? r.id : null;
  }

  // One scene: its still, its words, notes, and its actions.
  function stepCard(d, st, n) {
    var s = st.s, m = st.m;
    var key = SK.sceneKey(s.id, m.start);
    var thumb = el('div', { class: 'thumb' });
    var noteInput = el('textarea', { class: 'note-input', rows: '2', placeholder: 'Add a note to this scene', on: { click: function (e) { e.stopPropagation(); } } });
    var noted = (s.notes || []).filter(function (x) { return x.key === key; });
    var more = el('div', { class: 'more' }, [
      el('p', { text: m.text || 'Nothing was said in this scene.' }),
      noted.length ? el('div', { class: 'notes' }, noted.map(function (x) { return el('p', { class: 'note', text: x.text }); })) : null,
      el('div', { class: 'row' }, [
        noteInput,
        el('button', { class: 'chip', type: 'button', text: 'Add note', on: { click: function (e) {
          e.stopPropagation();
          var t = noteInput.value.trim();
          if (t) addNote(s, m, t);
        } } })
      ]),
      el('div', { class: 'row' }, [
        el('button', { class: 'chip', type: 'button', text: '▶ Play', on: { click: function (e) { e.stopPropagation(); playScene(d, s, m); } } }),
        el('button', { class: 'chip', type: 'button', text: 'Delete scene', on: { click: function (e) { e.stopPropagation(); deleteScene(d, s, m, n); } } })
      ])
    ]);
    var card = el('article', { class: 'card' + (m.marked ? ' marked' : ''), on: { click: function () { card.classList.toggle('open'); } } }, [
      thumb,
      el('b', { text: 'Scene ' + n + ' · ' + SK.formatTime(m.start) }),
      el('p', { class: 'words', text: m.text ? SK.firstWords(m.text, 8) : '(no words)' }),
      more
    ]);
    card._paint = function () {
      thumb.appendChild(SK.picture(visible(SK.stateAt(s, m.end)), boundsOf(s, d), 200, 130,
        { ac: acFor(s.scale || d.scale), ink: ink(), paper: BG }));
    };
    if (io) io.observe(card); else card._paint();
    return card;
  }

  // Plays one scene on the canvas, in the time it took to draw.
  var playing = 0;
  function playScene(d, s, m) {
    var box = $('vPlay'), cv = $('vCanvas'), c = cv.getContext('2d');
    var v = SK.fitView(boundsOf(s, d), cv.width, cv.height, 40, 60) || { x: 0, y: 0, z: 1 };
    var ac = acFor(s.scale || d.scale);
    var t0 = performance.now();
    function draw(T) {
      SK.paint(c, visible(SK.stateAt(s, T)), v, { ac: ac, ink: ink(), paper: BG, bg: BG, w: cv.width, h: cv.height });
      $('vClock').textContent = SK.formatTime(T - m.start) + ' / ' + SK.formatTime(m.end - m.start);
    }
    function frame() {
      var T = Math.min(m.end, m.start + (performance.now() - t0));
      draw(T);
      if (T < m.end) playing = requestAnimationFrame(frame);
      else playing = 0;
    }
    stopPlay();
    box.hidden = false;
    draw(m.start);
    playing = requestAnimationFrame(frame);
  }
  function stopPlay() {
    if (playing) cancelAnimationFrame(playing);
    playing = 0;
    $('vPlay').hidden = true;
  }

  // ---- edits: each one records what it changed, so undo can put it back ----

  // Writes changes to memory, redraws, and (live only) to the database.
  function apply(writes) {
    var dw = writes.filter(function (w) { return w.store === 'details'; });
    var sw = writes.filter(function (w) { return w.store === 'sessions'; });
    data = { details: SK.mergeRecords(data.details, dw), sessions: SK.mergeRecords(data.sessions, sw), exported: data.exported };
    reindex();
    render();
    if (mode === 'live') {
      return SK.applyWrites(SK.DB, writes).catch(function (e) { toast('Could not save: ' + (e && e.message ? e.message : e)); });
    }
    return Promise.resolve();
  }

  function commit(entry, writes) {
    hist.push(entry);
    return apply(writes);
  }

  function addNote(s, m, text) {
    var next = Object.assign({}, s, { notes: (s.notes || []).concat([{ key: SK.sceneKey(s.id, m.start), text: text, at: Date.now() }]) });
    delete next._scenes;
    commit({ details: [], sessions: SK.befores(data.sessions, [s.id]) }, [{ store: 'sessions', id: s.id, value: next }]);
    toast('Note added.');
  }

  function deleteScene(d, s, m, n) {
    if (!window.confirm('Delete scene ' + n + ' of "' + d.name + '"? Its drawing, words and notes go. Branches that came after it move up one step. Undo brings it back.')) return;
    var updates = SK.stepDeleteUpdates(data.details, d.id, n);
    var writes = [{ store: 'sessions', id: s.id, value: SK.removeScene(s, m) }];
    updates.forEach(function (u) {
      writes.push({ store: 'details', id: u.id, value: Object.assign({}, byDetail[u.id], { fork: u.fork }) });
    });
    commit({
      details: SK.befores(data.details, updates.map(function (u) { return u.id; })),
      sessions: SK.befores(data.sessions, [s.id])
    }, writes);
    toast('Scene ' + n + ' deleted. Undo brings it back.');
  }

  // Deletes a branch and its scenes. Its own branches move up to where it forked from its parent.
  function deleteLane(id) {
    var d = byDetail[id];
    if (!d) return;
    var below = data.details.filter(function (x) { return x.parentId === id; }).length;
    if (!window.confirm('Delete the branch "' + d.name + '" and its scenes? '
      + (below ? below + (below === 1 ? ' branch under it moves up to where it forked. ' : ' branches under it move up to where it forked. ') : '')
      + 'Undo brings it back until you close this page.')) return;
    var ups = SK.promoteUpdates(data.details, id);
    var mine = data.sessions.filter(function (s) { return s.detailId === id; });
    var writes = [{ store: 'details', id: id, value: null }];
    ups.forEach(function (u) {
      writes.push({ store: 'details', id: u.id, value: Object.assign({}, byDetail[u.id], { parentId: u.parentId, fork: u.fork }) });
    });
    mine.forEach(function (s) { writes.push({ store: 'sessions', id: s.id, value: null }); });
    commit({
      details: SK.befores(data.details, [id].concat(ups.map(function (u) { return u.id; }))),
      sessions: SK.befores(data.sessions, mine.map(function (s) { return s.id; }))
    }, writes);
    toast('Branch deleted. Undo brings it back.');
  }

  function undo() {
    var entry = hist.pop();
    if (!entry) { toast('Nothing to undo.'); return; }
    apply(SK.undoWrites(entry));
    toast('Undone.');
  }

  // ---- export: one file with the page and this history inside ----

  // The history as data. Sound is left out to keep the file small; the drawing, words, notes and playback stay.
  function bundle() {
    return {
      schema: 'quick-detail/history-1',
      exported: new Date().toISOString(),
      details: data.details.map(function (d) { return Object.assign({}, d); }),
      sessions: data.sessions.map(function (s) {
        var c = Object.assign({}, s);
        c.hasAudio = !!s.audio;
        delete c.audio;
        delete c._scenes;
        return c;
      })
    };
  }

  function exportHtml() {
    var b = bundle();
    var json = JSON.stringify(b).replace(/<\//g, '<\\/');
    var html = TEMPLATE.replace(BUNDLE_RE, function () {
      return '<script type="application/json" id="bundle">' + json + '</script>';
    });
    var paths = [];
    html.replace(ASSET_RE, function (m, css, js) { paths.push(css || js); return m; });
    var pending = paths.map(function (p) {
      return fetch(p).then(function (r) { if (!r.ok) throw new Error('could not read ' + p); return r.text(); });
    });
    Promise.all(pending).then(function (texts) {
      var i = 0;
      var out = html.replace(ASSET_RE, function (m, css) {
        var t = texts[i++];
        if (css) return '<style>\n' + t.replace(/<\/style/gi, '<\\/style') + '\n</style>';
        return '<script>\n' + t.replace(/<\/script/gi, '<\\/script') + '\n</script>';
      });
      var blob = new Blob([out], { type: 'text/html' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = slug((data.details.filter(function (d) { return !d.parentId; })[0] || {}).name) + '-history.html';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      toast('Exported. Open the file in any browser.');
    }).catch(function (e) {
      toast('Could not export here: ' + (e && e.message ? e.message : e) + '. Open this page from the app\'s site.');
    });
  }

  // ---- start: an exported file, the live database, or a picker when no detail is named ----

  function pick() {
    $('vTitle').textContent = 'Edit history';
    $('vSub').textContent = 'Choose a detail. Or open Edit history from its log.';
    SK.DB.all('details').then(function (all) {
      var main = $('vMain');
      main.innerHTML = '';
      var mains = all.filter(function (d) { return !d.parentId; });
      if (!mains.length) main.appendChild(el('p', { class: 'muted', text: 'No details on this device yet.' }));
      var box = el('div', { class: 'v-pick' });
      mains.forEach(function (d) {
        box.appendChild(el('button', { class: 'chip', type: 'button', text: d.name, on: { click: function () {
          location.hash = encodeURIComponent(d.id);
          location.reload();
        } } }));
      });
      main.appendChild(box);
    }).catch(function (e) { toast('Could not read the database: ' + (e && e.message ? e.message : e)); });
  }

  function start() {
    var raw = $('bundle').textContent;
    var b = null;
    try { b = JSON.parse(raw); } catch (err) { b = null; }
    if (b && b.schema === 'quick-detail/history-1') {
      mode = 'file';
      data = { details: b.details || [], sessions: b.sessions || [], exported: b.exported };
      reindex();
      render();
      return;
    }
    var id = decodeURIComponent((location.hash || '').slice(1));
    if (!id) { pick(); return; }
    SK.DB.all('details').then(function (all) {
      var fam = SK.familyOf(all, id);
      if (!fam.length) { $('vMain').textContent = 'That detail is not on this device.'; return null; }
      return Promise.all(fam.map(function (d) { return SK.DB.sessionsOf(d.id); })).then(function (lists) {
        var recs = [];
        lists.forEach(function (list) { list.forEach(function (s) { recs.push(s); }); });
        data = { details: fam, sessions: recs };
        reindex();
        render();
      });
    }).catch(function (e) { toast('Could not read the database: ' + (e && e.message ? e.message : e)); });
  }

  $('vUndo').addEventListener('click', undo);
  $('vExport').addEventListener('click', exportHtml);
  $('vClose').addEventListener('click', stopPlay);
  start();
})();
