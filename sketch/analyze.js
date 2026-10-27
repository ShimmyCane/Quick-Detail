// Sketch v3 — tags and metadata for elements, scenes and recordings. Pure: runs in the page and in Node.
//
// Every tag records where it came from:
//   drawn  — from what the element is (line, note, dimension)
//   said   — from words spoken in the scene where the element was drawn
//   stated — from the note text the user typed
(function (root) {
  'use strict';

  var SK = root.SK || {};

  // Construction words → tag. Multi-word terms are matched as whole words, with an optional s or es.
  SK.VOCAB = [
    ['membrane', 'membrane'], ['flashing', 'flashing'], ['sill', 'sill'], ['threshold', 'threshold'],
    ['wall', 'wall'], ['door', 'door'], ['window', 'window'], ['roof', 'roof'], ['parapet', 'parapet'],
    ['insulation', 'insulation'], ['batt', 'insulation'], ['drain', 'drainage'], ['gutter', 'drainage'],
    ['downspout', 'drainage'], ['slab', 'slab'], ['foundation', 'foundation'], ['footing', 'foundation'],
    ['vapor barrier', 'vapor barrier'], ['air barrier', 'air barrier'], ['sheathing', 'sheathing'],
    ['stud', 'framing'], ['joist', 'framing'], ['header', 'framing'], ['brick', 'masonry'],
    ['veneer', 'masonry'], ['sealant', 'sealant'], ['caulk', 'sealant'], ['gasket', 'sealant'],
    ['fastener', 'fastener'], ['screw', 'fastener'], ['lap', 'lapping'], ['slope', 'slope'],
    ['pan', 'sill pan'], ['termination', 'termination'], ['drip edge', 'drip edge'], ['cant', 'cant strip'],
    ['stucco', 'finish'], ['drywall', 'finish'], ['gypsum', 'finish'], ['tile', 'finish'],
    ['steel', 'steel'], ['concrete', 'concrete'], ['wood', 'wood']
  ];

  SK.keywordTags = function (text) {
    var s = ' ' + String(text || '').toLowerCase().replace(/[^a-z]+/g, ' ') + ' ';
    var out = [];
    SK.VOCAB.forEach(function (v) {
      if (out.indexOf(v[1]) < 0 && new RegExp(' ' + v[0] + '(s|es)? ').test(s)) out.push(v[1]);
    });
    return out;
  };

  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

  // A stroke's shape from its points. Lengths are real inches (the sheet is drawn at real size).
  SK.strokeGeometry = function (s) {
    var p = s.pts;
    if (p.length < 2) return { kind: 'dot', length: 0 };
    var path = 0;
    for (var i = 1; i < p.length; i++) path += dist(p[i - 1], p[i]);
    var chord = dist(p[0], p[p.length - 1]);
    if (path < 0.02) return { kind: 'dot', length: 0 };
    if (path > 0.5 && chord < 0.08 * path) return { kind: 'closed shape', length: path };
    if (chord > 0.02 && path / chord < 1.03) return { kind: 'line', length: chord };
    return { kind: 'freehand stroke', length: path };
  };

  SK.describeItem = function (item, ac) {
    if (item.kind === 'stroke') {
      var g = SK.strokeGeometry(item);
      var label = g.kind + (g.length ? ' ' + SK.formatLength(g.length, ac.roundTo) : '');
      var tag = g.kind === 'line' ? 'line' : g.kind === 'closed shape' ? 'shape' : 'freehand';
      return { type: g.kind, label: label, drawn: [tag], stated: [] };
    }
    if (item.kind === 'note') {
      return { type: 'note', label: 'note: ' + SK.firstWords(item.text, 8), drawn: ['note'], stated: SK.keywordTags(item.text) };
    }
    if (item.kind === 'dim') {
      return { type: 'dimension', label: 'dimension ' + SK.dimText(item, ac), drawn: ['dimension'], stated: [] };
    }
    return { type: item.kind, label: item.kind, drawn: [], stated: [] };
  };

  function uniq(list) {
    var out = [];
    list.forEach(function (x) { if (x && out.indexOf(x) < 0) out.push(x); });
    return out;
  }

  // Scenes across every recording of a detail, in the order they were made.
  SK.scenesOf = function (sessions) {
    var out = [];
    sessions.slice().sort(function (a, b) { return a.created - b.created; }).forEach(function (s) {
      SK.segment(s).forEach(function (m) {
        out.push({
          index: out.length + 1, sessionId: s.id, recorded: s.created, start: m.start, end: m.end,
          marked: m.marked, text: m.text, ids: m.ids, tags: SK.keywordTags(m.text)
        });
      });
    });
    return out;
  };

  SK.recordingStats = function (s) {
    var words = (s.speech || []).reduce(function (n, sp) { return n + sp.text.split(/\s+/).length; }, 0);
    var voice = (s.voice || []).reduce(function (n, v) { return n + (v[1] - v[0]); }, 0);
    var marks = s.events.filter(function (ev) { return ev.type === 'mark'; }).length;
    return {
      id: s.id, created: s.created, duration: s.duration, scenes: SK.segment(s).length,
      words: words, voiceMs: voice, marks: marks, hasAudio: !!s.audio
    };
  };

  // When each element was drawn, per recording: strokes by their span, notes and dimensions by their placement.
  function spansOf(s) {
    var out = {};
    s.events.forEach(function (ev) {
      if (ev.type !== 'put') return;
      out[ev.item.id] = ev.anim ? { start: ev.item.t0, end: SK.strokeEnd(ev.item) } : { start: ev.t, end: ev.t };
    });
    return out;
  }

  // Each spoken line goes to the element drawn closest to it in time (within SPEECH_REACH_MS).
  // That is a guess: the same words can belong to a nearby element. Scene tags keep the wider context.
  var SPEECH_REACH_MS = 6000;
  function spokenFor(sessions) {
    var words = {};
    sessions.forEach(function (s) {
      var spans = spansOf(s);
      (s.speech || []).forEach(function (sp) {
        var best = null, reach = SPEECH_REACH_MS;
        Object.keys(spans).forEach(function (id) {
          var sn = spans[id];
          var d = sp.t < sn.start ? sn.start - sp.t : sp.t > sn.end ? sp.t - sn.end : 0;
          if (d < reach || (d === reach && best && spans[best].start > sn.start)) { reach = d; best = id; }
        });
        if (best && reach < SPEECH_REACH_MS) (words[best] = words[best] || []).push(sp.text);
      });
    });
    return words;
  }

  // Tag every element of a detail from what it is and from what was said while it was drawn.
  SK.analyze = function (detail, sessions, ac) {
    var scenes = SK.scenesOf(sessions);
    var linked = {};
    scenes.forEach(function (sc) {
      sc.ids.forEach(function (id) { (linked[id] = linked[id] || []).push(sc); });
    });
    var words = spokenFor(sessions);
    var elements = detail.items.map(function (it) {
      var d = SK.describeItem(it, ac);
      var lines = words[it.id] || [];
      var said = [];
      lines.forEach(function (line) { said = said.concat(SK.keywordTags(line)); });
      said = uniq(said);
      return {
        id: it.id, kind: it.kind, type: d.type, label: d.label,
        tags: uniq(d.drawn.concat(d.stated, said)),
        drawn: d.drawn,
        stated: d.stated,
        said: said,
        why: lines.join(' ') || null,
        scenes: (linked[it.id] || []).map(function (x) { return x.index; })
      };
    });
    var byId = {};
    elements.forEach(function (e) { byId[e.id] = e; });
    return {
      generated: new Date().toISOString(),
      elements: elements,
      scenes: scenes.map(function (sc) {
        return {
          index: sc.index, sessionId: sc.sessionId, recorded: sc.recorded, start: sc.start, end: sc.end, marked: sc.marked,
          text: sc.text, tags: sc.tags, ids: sc.ids,
          elements: sc.ids.map(function (id) { return byId[id] ? byId[id].label : null; }).filter(Boolean)
        };
      }),
      recordings: sessions.map(SK.recordingStats)
    };
  };

  // Element tags as stored on each item: { tags, said, why, label }.
  SK.itemMeta = function (e) {
    return { tags: e.tags, said: e.said, why: e.why, label: e.label, analyzed: Date.now() };
  };

  // Everything an AI needs to read a detail: what it is, each element and why it was drawn, each scene.
  SK.detailMetadata = function (detail, analysis) {
    var counts = {};
    analysis.elements.forEach(function (e) { counts[e.type] = (counts[e.type] || 0) + 1; });
    var fromElements = [].concat.apply([], analysis.elements.map(function (e) { return e.tags; }));
    var tags = uniq([].concat(detail.tags || [], fromElements));
    var parts = Object.keys(counts).map(function (k) { return counts[k] + ' ' + k + (counts[k] > 1 ? 's' : ''); });
    return {
      format: 'wall-sketch/metadata-1',
      detail: { id: detail.id, name: detail.name, scale: detail.scale, tags: detail.tags || [], parent: detail.parentId || null },
      summary: detail.name + ' at ' + detail.scale + '. ' +
        (parts.length ? 'Contains ' + parts.join(', ') + '. ' : 'No elements yet. ') +
        (tags.length ? 'Tags: ' + tags.join(', ') + '.' : ''),
      tags: tags,
      elements: analysis.elements.map(function (e) {
        return { id: e.id, type: e.type, label: e.label, tags: e.tags, said: e.said, why: e.why };
      }),
      scenes: analysis.scenes.map(function (sc) {
        return { index: sc.index, at: sc.start, end: sc.end, marked: sc.marked, said: sc.text, tags: sc.tags, elements: sc.elements };
      }),
      recordings: analysis.recordings,
      generated: analysis.generated
    };
  };

  // A smaller record for one scene's picture: the scene, and the elements that are on the sheet by then.
  SK.sceneMetadata = function (detail, analysis, scene, visibleIds) {
    var vis = analysis.elements.filter(function (e) { return visibleIds.indexOf(e.id) >= 0; });
    return {
      format: 'wall-sketch/scene-1',
      detail: { name: detail.name, scale: detail.scale, tags: detail.tags || [] },
      scene: { index: scene.index, at: scene.start, end: scene.end, marked: scene.marked, said: scene.text, tags: scene.tags },
      elementsOnSheet: vis.map(function (e) { return { type: e.type, label: e.label, tags: e.tags, why: e.why }; })
    };
  };

  // JPEG comment segments. The metadata travels inside the image file itself.
  var MAX_COMMENT = 65533 - 2;

  SK.jpegWithComment = function (bytes, text) {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('not a JPEG');
    var enc = new TextEncoder().encode(text);
    if (enc.length > MAX_COMMENT) throw new Error('metadata too long for a JPEG comment');
    var len = enc.length + 2;
    var out = new Uint8Array(bytes.length + 4 + enc.length);
    out.set(bytes.subarray(0, 2), 0);
    out[2] = 0xff;
    out[3] = 0xfe;
    out[4] = len >> 8;
    out[5] = len & 0xff;
    out.set(enc, 6);
    out.set(bytes.subarray(2), 6 + enc.length);
    return out;
  };

  SK.jpegComment = function (bytes) {
    var i = 2;
    while (i + 4 <= bytes.length) {
      if (bytes[i] !== 0xff) return null;
      var m = bytes[i + 1];
      if (m === 0xd9 || m === 0xda) return null;
      var len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (m === 0xfe) return new TextDecoder().decode(bytes.subarray(i + 4, i + 2 + len));
      i += 2 + len;
    }
    return null;
  };

  root.SK = SK;
  if (typeof module !== 'undefined' && module.exports) module.exports = SK;
})(typeof window !== 'undefined' ? window : globalThis);
