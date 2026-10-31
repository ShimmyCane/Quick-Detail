// Quick Detail — the JSON parallel of a detail. Every save writes one beside the detail: the line work as a drawing spec
// (the same format sketch/author.js reads), the sheet items exactly as they are, and every recording take with its
// commands (the put, del, replace and mark events), speech and scenes. Future details can be generated from it.
// Pure: runs in the page and in Node tests.
(function (root) {
  'use strict';

  var SK = root.SK || {};

  SK.PARALLEL_SCHEMA = 'quick-detail/parallel-1';

  // The weight key whose paper width, times the scale factor, gives this stroke width.
  function weightKey(w, f) {
    for (var k in SK.WEIGHTS) if (Math.abs(SK.WEIGHTS[k] * f - w) < 1e-9) return k;
    return 'w2';
  }

  // Points without repeats in a row. Strokes keep their corners doubled for smoothing; the spec lists each point once.
  function distinct(pts) {
    var out = [];
    pts.forEach(function (p) {
      var last = out[out.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push([p[0], p[1]]);
    });
    return out;
  }

  // One sheet item as a spec entry. Angular dimensions have no spec form; they stay in the exact items list.
  function specOf(it, f) {
    var pen = it.c && it.c !== 'ink' ? it.c : undefined;
    if (it.kind === 'stroke') {
      return { kind: 'line', pts: distinct(it.pts), weight: weightKey(it.w, f), pen: pen };
    }
    if (it.kind === 'hatch') {
      return { kind: 'hatch', pattern: it.pattern, pts: it.pts, outline: !!it.outline, pen: pen };
    }
    if (it.kind === 'note') {
      var tips = it.leaders.map(function (l) { return l.tip; });
      var out = { kind: 'note', text: it.text, at: it.at, width: it.width, arrow: (it.leaders[0] || {}).arrow, pen: pen };
      if (tips.length === 1) out.tip = tips[0]; else out.tips = tips;
      return out;
    }
    if (it.kind === 'block') return { kind: 'block', sourceId: it.sourceId, at: it.at };   // a reference: the source's lines are not copied here
    if (it.kind === 'dim' && it.mode !== 'angular') {
      return { kind: 'dim', mode: it.mode, p1: it.p1, p2: it.p2, at: it.at, end: it.end, pen: pen };
    }
    return null;
  }

  // The parallel of a detail. takes: [{ id, created, duration, scale, base, events, speech, voice, recording }]
  // where recording is true for a take still in progress.
  SK.parallelOf = function (detail, takes, now) {
    var f = SK.scaleOf(detail.scale).factor;
    var spec = [];
    detail.items.forEach(function (it) {
      var s = specOf(it, f);
      if (s) spec.push(s);
    });
    return {
      schema: SK.PARALLEL_SCHEMA,
      saved: new Date(now || Date.now()).toISOString(),
      detailId: detail.id,
      detail: { name: detail.name, scale: detail.scale, tags: detail.tags || [], parentId: detail.parentId || null },
      spec: { name: detail.name, scale: detail.scale, tags: detail.tags || [], items: spec },
      items: detail.items,
      takes: (takes || []).map(function (t) {
        var scenes = t.events ? SK.segment({ events: t.events, speech: t.speech || [], voice: t.voice || [] }) : [];
        return {
          id: t.id,
          created: t.created ? new Date(t.created).toISOString() : null,
          duration: t.duration == null ? null : t.duration,
          recording: !!t.recording,
          scale: t.scale || detail.scale,
          base: t.base || [],
          commands: t.events || [],
          speech: t.speech || [],
          scenes: scenes.map(function (m) { return { start: m.start, end: m.end, text: m.text, items: m.ids, marked: m.marked }; })
        };
      })
    };
  };

  root.SK = SK;
  if (typeof module !== 'undefined' && module.exports) module.exports = SK;
})(typeof window !== 'undefined' ? window : globalThis);
