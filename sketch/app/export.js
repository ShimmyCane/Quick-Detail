// Quick Detail app — Exports.
// The printable sheet canvas, PNG and JPEG (with metadata), scene series, data JSON, parallel JSON, and element tagging.
// Part of the app split across sketch/app/*.js. The parts share the page's global scope, so load order matters:
// see the <script> list in index.html and docs/code-map/index.html.
'use strict';

// ---- exports ----

// A white sheet at 150 dpi of paper, cropped to the drawing, with the detail title under it.
function sheetCanvas(items, b, d, opts) {
  opts = opts || {};
  var dpi = 150, f = factorOf(d);
  var z = dpi / f;
  var margin = 0.4 * dpi, titleH = 1.0 * dpi;
  var bw = (b.maxx - b.minx) * z, bh = (b.maxy - b.miny) * z;
  var k = Math.min(1, 7000 / Math.max(bw + 2 * margin, bh + 2 * margin + titleH));
  z *= k;
  var w = Math.ceil(Math.max(bw * k + 2 * margin, 3.2 * dpi)), h = Math.ceil(bh * k + 2 * margin + titleH);
  var cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  var c = cv.getContext('2d');
  var v = { x: b.minx - margin / z, y: b.miny - margin / z, z: z };
  SK.paint(c, visible(SK.printable(items)), v, { ac: acFor(d), ink: '#000', paper: '#fff', bg: '#ffffff', fill: !opts.transparent, w: w, h: h, print: true });
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = '#000';
  c.textAlign = 'left';
  c.font = 'bold ' + Math.round(0.16 * dpi) + 'px ' + SK.FONT;
  var name = (d.name || 'Untitled detail').toUpperCase();
  var ty = h - titleH + 0.3 * dpi;
  c.fillText(name, margin, ty);
  c.fillRect(margin, ty + 0.06 * dpi, Math.max(c.measureText(name).width, 1.5 * dpi), Math.max(2, 0.012 * dpi));
  c.font = Math.round(0.11 * dpi) + 'px ' + SK.FONT;
  c.fillText(d.scale === 'NTS' ? 'NOT TO SCALE' : 'SCALE: ' + SK.scaleOf(d.scale).label, margin, ty + 0.25 * dpi);
  if (d.tags && d.tags.length) c.fillText('TAGS: ' + d.tags.join(', ').toUpperCase(), margin, ty + 0.42 * dpi);
  return cv;
}

function jpeg(cv, name) {
  return new Promise(function (resolve) {
    cv.toBlob(function (blob) { download(blob, name); resolve(); }, 'image/jpeg', 0.92);
  });
}

// Current analysis of the open detail, with every element's tags and every scene's transcript.
function analysis() { return SK.analyze(detail, sessions, ac()); }

function metadataPreview() {
  if (!detail.items.length) return 'Nothing to describe yet. Draw, talk, then tag the elements.';
  return SK.detailMetadata(detail, analysis()).summary;
}

// Tags each element from its shape and from what was said while it was drawn. Stored on the element as meta.
function tagElements() {
  var an = analysis();
  var byId = {};
  an.elements.forEach(function (e) { byId[e.id] = e; });
  detail.items = detail.items.map(function (it) {
    var e = byId[it.id];
    if (!e) return it;
    var n = clone(it);
    n.meta = SK.itemMeta(e);
    return n;
  });
  detail.modified = Date.now();
  saveNow().then(function () {
    toast('Tagged ' + an.elements.length + (an.elements.length === 1 ? ' element.' : ' elements.'));
    if (panelKind === 'project') {
      var body = $('panelBody');
      body.innerHTML = '';
      renderProject(body);
    }
  }).catch(function (e) { fail(e, 'Could not save the tags: '); });
}

// A JPEG with its metadata inside it (a JPEG comment), and the same metadata as a sidecar file.
// If the metadata is too big for a comment, the image gets the summary and element labels only.
function jpegWithMeta(cv, name, meta) {
  return new Promise(function (resolve, reject) {
    cv.toBlob(function (blob) {
      blob.arrayBuffer().then(function (buf) {
        var bytes = new Uint8Array(buf);
        var tagged;
        try {
          tagged = SK.jpegWithComment(bytes, JSON.stringify(meta));
        } catch (err) {
          var slim = clone(meta);
          slim.scenes = (slim.scenes || []).map(function (sc) { return { index: sc.index, at: sc.at, said: (sc.said || '').slice(0, 160) }; });
          slim.elements = (slim.elements || []).map(function (e) { return { type: e.type, label: e.label, tags: e.tags }; });
          slim.truncated = true;
          tagged = SK.jpegWithComment(bytes, JSON.stringify(slim));
        }
        download(new Blob([tagged], { type: 'image/jpeg' }), name);
        download(new Blob([JSON.stringify(meta, null, 1)], { type: 'application/json' }), name.replace(/\.jpg$/, '.metadata.json'));
        resolve();
      }).catch(reject);
    }, 'image/jpeg', 0.92);
  });
}

function exportPng() {
  var b = SK.itemsBounds(visible(SK.printable(detail.items)), ac());
  if (!b) { toast('Nothing to export yet.'); return; }
  sheetCanvas(detail.items, b, detail, { transparent: true }).toBlob(function (blob) {
    download(blob, slug(detail.name) + '.png');
  }, 'image/png');
}

function exportJpeg() {
  var b = SK.itemsBounds(visible(SK.printable(detail.items)), ac());
  if (!b) { toast('Nothing to export yet.'); return; }
  var an = analysis();
  var meta = SK.detailMetadata(detail, an);
  jpegWithMeta(sheetCanvas(detail.items, b, detail), slug(detail.name) + '.jpg', meta).catch(fail);
}

// One image per scene, each with the scene's own metadata and the elements on the sheet by then.
function exportSeries() {
  var an = analysis();
  if (!an.scenes.length) { toast('No scenes to export yet.'); return; }
  var byId = {};
  sessions.forEach(function (s) { byId[s.id] = s; });
  var frames = an.scenes.map(function (sc) {
    var items = SK.stateAt(byId[sc.sessionId], sc.end);
    return { items: items, sc: sc, ids: items.map(function (it) { return it.id; }) };
  });
  var pts = [];
  sessions.forEach(function (s) {
    var sb = sessionBounds(s);
    if (sb) pts.push([sb.minx, sb.miny], [sb.maxx, sb.maxy]);
  });
  var b = SK.boundsOf(pts) || SK.itemsBounds(visible(detail.items), ac());
  if (!b) { toast('Nothing to export yet.'); return; }
  toast('Exporting ' + frames.length + ' images. Allow multiple downloads if asked.');
  var i = 0;
  (function next() {
    if (i >= frames.length) return;
    var f = frames[i];
    i++;
    var name = slug(detail.name) + '-scene-' + (i < 10 ? '0' : '') + i + '.jpg';
    var meta = SK.sceneMetadata(detail, an, f.sc, f.ids);
    jpegWithMeta(sheetCanvas(f.items, b, detail), name, meta)
      .then(function () { setTimeout(next, 500); })
      .catch(fail);
  })();
}

function exportData() {
  var data = {
    app: 'wall-sketch',
    version: 3,
    exported: new Date().toISOString(),
    detail: detail,
    recordings: sessions.map(function (s) {
      return {
        id: s.id, created: new Date(s.created).toISOString(), duration: s.duration, scale: s.scale,
        hasAudio: !!s.audio, audioOffset: s.audioOffset, speech: s.speech, voice: s.voice,
        scenes: SK.segment(s).map(function (m) { return { start: m.start, end: m.end, text: m.text, items: m.ids, marked: m.marked }; }),
        base: s.base, events: s.events
      };
    })
  };
  download(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), slug(detail.name) + '.json');
}

function exportParallel() {
  saveNow().then(function () {
    return SK.DB.get('parallels', detail.id);
  }).then(function (p) {
    download(new Blob([JSON.stringify(p, null, 1)], { type: 'application/json' }), slug(detail.name) + '.parallel.json');
  }).catch(function (e) { fail(e, 'Could not export: '); });
}
