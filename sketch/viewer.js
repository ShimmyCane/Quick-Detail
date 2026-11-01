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
  // What the GIF helpers need to draw a sheet on this page.
  var gifEnv = {
    visible: function (items) { return visible(items); },
    ac: function (scale) { return acFor(scale); },
    get ink() { return ink(); },
    paper: BG
  };

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

  function download(bytes, type, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  // Runs a slow job after the page has shown a message: encoding a GIF takes a moment.
  function working(msg, job) {
    toast(msg);
    setTimeout(job, 40);
  }

  // The scenes from the main line down to a lane, in the order they were drawn: each lane up to the step the next one
  // forked from, then the lane's own scenes.
  function pathSteps(id) {
    var chain = [];
    var cur = byDetail[id];
    while (cur) { chain.unshift(cur); cur = cur.parentId ? byDetail[cur.parentId] : null; }
    var out = [];
    chain.forEach(function (lane, i) {
      var steps = stepsOf(lane.id);
      var upto = i + 1 < chain.length && chain[i + 1].fork && chain[i + 1].fork.step != null ? chain[i + 1].fork.step : steps.length;
      steps.slice(0, upto).forEach(function (st) { out.push(st); });
    });
    return out;
  }

  function gifCard(d, st, n) {
    working('Making the GIF…', function () {
      try {
        download(SK.sceneGif(st.s, st.m, gifEnv), 'image/gif', slug(d.name) + '-scene-' + n + '.gif');
        toast('Saved the scene GIF.');
      } catch (e) { toast('Could not make the GIF: ' + (e && e.message ? e.message : e)); }
    });
  }

  function gifLane(d, label) {
    var steps = pathSteps(d.id);
    if (!steps.length) { toast('Nothing to animate yet.'); return; }
    working('Making the GIF…', function () {
      try {
        var rootName = (data.details.filter(function (x) { return !x.parentId; })[0] || d).name;
        download(SK.lineGif(steps, gifEnv), 'image/gif', slug(rootName) + '-' + String(label).replace(/\./g, '-') + '.gif');
        toast('Saved the GIF to ' + label + '.');
      } catch (e) { toast('Could not make the GIF: ' + (e && e.message ? e.message : e)); }
    });
  }


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
    $('vSub').textContent = mode === 'file' ? 'exported ' + new Date(data.exported || Date.now()).toLocaleDateString() : 'live';
    var offsets = SK.laneOffsets(data.details);
    order.forEach(function (id) { main.appendChild(laneSection(byDetail[id], labels, offsets)); });
    SK.drawForks(main);
  }

  window.addEventListener('resize', function () { SK.drawForks($('vMain')); });

  // One lane: a header with its address, name, fork and first words, then its scenes.
  function laneSection(d, labels, offsets) {
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
        // Only the main line carries its name; a branch is read from its address and the fork lines.
        d.parentId ? null : el('span', { class: 'track-name', text: d.name })
      ]),
      first ? el('p', { class: 'track-desc', text: SK.firstWords(first.m.text, 14) }) : null,
      el('div', { class: 'v-lane-actions' }, [
        el('button', { class: 'chip', type: 'button', text: 'GIF', title: 'A GIF of everything from the start to the end of this line', on: { click: function (e) { e.stopPropagation(); gifLane(d, labels[d.id] || '0'); } } }),
        d.parentId ? el('button', { class: 'chip', type: 'button', text: 'Delete', title: 'Delete this branch', on: { click: function (e) { e.stopPropagation(); deleteLane(d.id); } } }) : null
      ])
    ]);
    var row = el('div', { class: 'track-row' }, [SK.leadFor(offsets[d.id])]);
    if (!collapsed) {
      var strip = el('div', { class: 'strip' });
      if (!steps.length) strip.appendChild(el('p', { class: 'muted', text: 'No scenes in this lane.' }));
      steps.forEach(function (st, i) { strip.appendChild(stepCard(d, st, i + 1)); });
      row.appendChild(strip);
    }
    var body = el('div', { class: 'track-body' }, [row]);
    var attrs = { class: 'track' + (collapsed ? ' folded' : '') + (d.id === rootId() ? ' current' : ''), 'data-lane': d.id };
    if (d.parentId) { attrs['data-parent'] = d.parentId; attrs['data-fork'] = d.fork && d.fork.step != null ? d.fork.step : 0; }
    return el('section', attrs, [head, body]);
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
        el('button', { class: 'chip', type: 'button', text: 'GIF', on: { click: function (e) { e.stopPropagation(); gifCard(d, st, n); } } }),
        el('button', { class: 'chip', type: 'button', text: 'Delete scene', on: { click: function (e) { e.stopPropagation(); deleteScene(d, s, m, n); } } })
      ])
    ]);
    // Notes sit on the face of the card, so they show without opening it.
    var card = el('article', { class: 'card' + (m.marked ? ' marked' : ''), 'data-step': n, on: { click: function () { card.classList.toggle('open'); } } }, [
      thumb,
      el('b', { text: 'Scene ' + n + ' · ' + SK.formatTime(m.start) }),
      el('p', { class: 'words', text: m.text ? SK.firstWords(m.text, 8) : '(no words)' }),
      noted.length ? el('div', { class: 'notes' }, noted.map(function (x) { return el('p', { class: 'note', text: x.text }); })) : null,
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

  // ---- cloud versions: a save is one ZIP with the editable state, a transparent PNG per restore point, and the copies
  // of the sources its blocks use. The database keeps one row per version; the ZIP is in the bucket. ----

  function rootDetail() { return data.details.filter(function (d) { return !d.parentId; })[0] || null; }

  // A transparent PNG of one drawing: no paper fill, so the background shows through.
  function pngOf(items, scale) {
    var vis = visible(items);
    var b = SK.itemsBounds(vis, acFor(scale));
    var cv = document.createElement('canvas');
    cv.width = 1200;
    cv.height = 800;
    var g = cv.getContext('2d');
    var v = SK.fitView(b, cv.width, cv.height, 40) || { x: 0, y: 0, z: 1 };
    SK.paint(g, vis, v, { ac: acFor(scale), ink: ink(), paper: BG, w: cv.width, h: cv.height, fill: false });
    return new Promise(function (resolve, reject) {
      cv.toBlob(function (bl) {
        if (!bl) { reject(new Error('a picture could not be made')); return; }
        bl.arrayBuffer().then(function (ab) { resolve(new Uint8Array(ab)); }, reject);
      }, 'image/png');
    });
  }

  // Every restore point of every lane, with its items and its picture.
  function buildPoints() {
    var labels = SK.laneLabels(data.details);
    var offsets = SK.laneOffsets(data.details);
    var out = [];
    SK.laneOrder(data.details).forEach(function (id) {
      var d = byDetail[id];
      var sess = sessionsOf(id);
      var steps = stepsOf(id);
      var forks = data.details.filter(function (x) { return x.parentId === id && x.fork && x.fork.step != null; })
        .map(function (x) { return x.fork.step; });
      var plan = SK.pointPlan(steps.map(function (st) { return { sessionId: st.s.id, end: st.m.end }; }), forks);
      var notes = steps.map(function (st, i) { return { step: i + 1, said: st.m.text || '', notes: noteTexts(st) }; });
      out.push({
        id: id, label: labels[id] || '?', parentId: d.parentId || null, fork: d.fork || null, name: d.name,
        offset: offsets[id] || 0, stepNotes: notes,
        points: plan.map(function (p) {
          var s = sess.filter(function (x) { return x.id === p.sessionId; })[0];
          return { step: p.step, kind: p.kind, items: SK.stateAt(s, p.T), scale: d.scale };
        })
      });
    });
    return out;
  }

  function noteTexts(st) {
    var key = SK.sceneKey(st.s.id, st.m.start);
    return (st.s.notes || []).filter(function (n) { return n.key === key; }).map(function (n) { return n.text; });
  }

  function saveVersion() {
    if (mode !== 'live') { toast('Open the live history to save it to the cloud.'); return; }
    var root = rootDetail();
    if (!root) return;
    working('Saving to the cloud…', function () {
      var rowId = null, next = 2;
      SK.Cloud.session().then(function (sess) {
        if (!sess) throw new Error('Sign in to the cloud from the app first (Library).');
        return SK.Cloud.init().from('sketch_details').select('id, version').eq('local_id', root.id).maybeSingle();
      }).then(function (r) {
        if (r.error) throw r.error;
        if (!r.data) throw new Error('Upload this detail to the cloud first, from the library.');
        rowId = r.data.id;
        next = (r.data.version || 1) + 1;
        return buildPoints();
      }).then(function (lanes) {
        var pics = [];
        var chain = Promise.resolve();
        lanes.forEach(function (lane) {
          lane.points.forEach(function (p) {
            chain = chain.then(function () {
              return pngOf(p.items, p.scale).then(function (png) {
                p.file = SK.pointName(lane.label, p.step);
                p.png = png;
              });
            });
          });
        });
        return chain.then(function () { return lanes; });
      }).then(function (lanes) {
        return SK.DB.all('details').then(function (all) {
          var byAll = {};
          all.forEach(function (d) { byAll[d.id] = d; });
          var used = [];
          lanes.forEach(function (l) { l.points.forEach(function (p) { used = used.concat(p.items); }); });
          var embeds = SK.embedsOf(used, function (id) { return byAll[id] || null; });
          var files = SK.versionFiles({ version: next, rootId: root.id, lanes: lanes, embeds: embeds });
          return { files: files, lanes: lanes, embeds: embeds };
        });
      }).then(function (made) {
        var zipFiles = [{ name: 'state.json', data: made.files['state.json'] }, { name: 'manifest.json', data: made.files['manifest.json'] }];
        made.lanes.forEach(function (l) { l.points.forEach(function (p) { zipFiles.push({ name: p.file, data: p.png }); }); });
        var zip = SK.makeZip(zipFiles);
        var path = root.id + '/versions/v' + next + '.zip';
        var c = SK.Cloud.init();
        return c.storage.from(SK.CLOUD.bucket).upload(path, new Blob([zip], { type: 'application/zip' }), { contentType: 'application/zip', upsert: true })
          .then(function (u) { if (u.error) throw u.error; return c.from('sketch_versions').upsert({ detail_id: rowId, version: next, file_path: path, label: 'v' + next }, { onConflict: 'detail_id,version' }); })
          .then(function (r) { if (r.error) throw r.error; return c.from('sketch_details').update({ version: next }).eq('id', rowId); })
          .then(function (r) { if (r.error) throw r.error; return next; });
      }).then(function (n) {
        toast('Saved to the cloud as v' + n + '.');
      }).catch(function (e) {
        toast('Could not save: ' + (e && e.message ? e.message : e));
      });
    });
  }

  // The saved versions of the open tree, newest first, with Open for each.
  function openVersions() {
    var box = $('vVersionsBox');
    box.hidden = false;
    box.innerHTML = '';
    box.appendChild(el('p', { class: 'muted', text: 'Loading the saved versions…' }));
    var root = rootDetail();
    if (!root) return;
    SK.Cloud.init().from('sketch_details').select('id').eq('local_id', root.id).maybeSingle().then(function (r) {
      if (r.error) throw r.error;
      if (!r.data) { box.innerHTML = ''; box.appendChild(el('p', { class: 'muted', text: 'This detail is not in the cloud yet.' })); return null; }
      return SK.Cloud.init().from('sketch_versions').select('id, version, file_path, created_at').eq('detail_id', r.data.id).order('version', { ascending: false });
    }).then(function (rows) {
      if (!rows) return;
      if (rows.error) throw rows.error;
      box.innerHTML = '';
      box.appendChild(el('button', { class: 'chip', type: 'button', text: 'Close', on: { click: function () { box.hidden = true; } } }));
      if (!rows.data.length) box.appendChild(el('p', { class: 'muted', text: 'No saved versions yet.' }));
      rows.data.forEach(function (v) {
        box.appendChild(el('div', { class: 'row' }, [
          el('b', { text: 'v' + v.version }),
          el('span', { class: 'muted', text: new Date(v.created_at).toLocaleString() }),
          el('button', { class: 'chip', type: 'button', text: 'Open', on: { click: function () { openVersion(v); } } })
        ]));
      });
    }).catch(function (e) { toast('Could not list the versions: ' + (e && e.message ? e.message : e)); });
  }

  // A saved version, shown from its ZIP: each lane's restore points as pictures, and the copies of its sources.
  function openVersion(v) {
    toast('Opening v' + v.version + '…');
    SK.Cloud.init().storage.from(SK.CLOUD.bucket).download(v.file_path).then(function (r) {
      if (r.error) throw r.error;
      return r.data.arrayBuffer();
    }).then(function (ab) {
      var files = SK.readZip(new Uint8Array(ab));
      var state = JSON.parse(new TextDecoder().decode(files['state.json']));
      var manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
      renderVersion(v, state, manifest, files);
    }).catch(function (e) { toast('Could not open the version: ' + (e && e.message ? e.message : e)); });
  }

  function renderVersion(v, state, manifest, files) {
    $('vTitle').textContent = (rootDetail() || {}).name + ' · v' + v.version;
    $('vSub').textContent = 'saved ' + new Date(manifest.saved).toLocaleString() + ' · pictures, from the cloud';
    var main = $('vMain');
    main.innerHTML = '';
    main.appendChild(el('p', { class: 'muted' }, [el('button', { class: 'chip', type: 'button', text: 'Back to live', on: { click: function () { $('vTitle').textContent = (rootDetail() || {}).name + ' · edit history'; render(); } } })]));
    manifest.lanes.forEach(function (lane) {
      var row = el('div', { class: 'track-row' }, [SK.leadFor(lane.offset || 0)]);
      lane.points.forEach(function (p) {
        var url = URL.createObjectURL(new Blob([files[p.file]], { type: 'image/png' }));
        row.appendChild(el('div', { class: 'card' }, [
          el('img', { src: url, alt: 'step ' + p.step, style: 'width:200px;height:130px;object-fit:contain;background:transparent' }),
          el('b', { text: 'step ' + p.step + (p.kind === 'fork' ? ' · fork' : ' · end') }),
          el('div', { class: 'row' }, [el('button', { class: 'chip', type: 'button', text: 'Open as a new detail', on: { click: function () { openPointAsDetail(lane, p, state); } } })])
        ]));
      });
      main.appendChild(el('section', { class: 'track' }, [
        el('header', { class: 'track-head' }, [el('b', { class: 'addr', text: lane.label })]),
        el('div', { class: 'track-body' }, [row])
      ]));
    });
    var embeds = state.embeds || {};
    var ids = Object.keys(embeds);
    if (ids.length) {
      var list = el('div', { class: 'v-pick' }, [el('h3', { text: 'Copies of sources used by this version' })]);
      ids.forEach(function (id) {
        var e = embeds[id];
        var here = byDetail[id];
        var status = here ? 'on this device' : 'not on this device';
        var kids = [el('span', { text: e.name + ' · ' + status })];
        if (!here) kids.push(el('button', { class: 'chip', type: 'button', text: 'Restore the copy here', on: { click: function () { restoreCopy(id, e); } } }));
        list.appendChild(el('div', { class: 'row' }, kids));
      });
      main.appendChild(list);
    }
  }

  function openPointAsDetail(lane, p, state) {
    var now = Date.now();
    var root = rootDetail();
    var d = {
      id: 'd' + now.toString(36) + Math.random().toString(36).slice(2, 6),
      name: (root ? root.name : lane.name) + ' · ' + lane.label + ' step ' + p.step,
      scale: p.scale || (root && root.scale) || SK.DEFAULT_SCALE, tags: [], items: p.items || [], parentId: null,
      created: now, modified: now, rating: 1
    };
    SK.DB.put('details', d).then(function () { toast('Saved as a new detail: ' + d.name + '. Open it from the library.'); })
      .catch(function (e) { toast('Could not save: ' + (e && e.message ? e.message : e)); });
  }

  // A copy a version holds for a source that is not on this device: it comes back under the source's own id, so the
  // blocks that point at it draw again.
  function restoreCopy(id, e) {
    var now = Date.now();
    var d = { id: id, name: e.name, scale: e.scale || SK.DEFAULT_SCALE, tags: [], items: e.items || [], parentId: null, created: now, modified: e.version || now, rating: 1 };
    SK.DB.put('details', d).then(function () { toast('Restored "' + e.name + '" here.'); openVersions(); })
      .catch(function (err) { toast('Could not restore: ' + (err && err.message ? err.message : err)); });
  }

  $('vSave').addEventListener('click', saveVersion);
  $('vVersions').addEventListener('click', openVersions);
  $('vUndo').addEventListener('click', undo);
  $('vExport').addEventListener('click', exportHtml);
  $('vClose').addEventListener('click', stopPlay);
  start();
})();
