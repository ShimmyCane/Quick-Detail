// Quick Detail — drawing from JSON. A plain description of a detail (lines, rectangles, hatches, notes, dimensions)
// becomes the same items the drawing tools make, so it can be opened, edited, undone and exported like any other detail.
// Pure: runs in the page and in Node tests.
//
// Spec (all positions are real inches, x to the right, y down; see docs/examples/window-sill-concrete-12in.json):
// {
//   "name": "Interior window sill, 12in concrete wall",
//   "scale": "3\"=1'-0\"",            optional, default 3"=1'-0"
//   "tags": ["window", "wall"],       optional, chips shown on the detail
//   "items": [
//     { "kind": "line", "pts": [[x, y], ...], "weight": "w3", "pen": "ink" },
//     { "kind": "rect", "x": 0, "y": 0, "w": 12, "h": 30, "weight": "w2" },
//     { "kind": "hatch", "pattern": "concrete", "pts": [[x, y], ...], "outline": true },
//     { "kind": "note", "text": "WOOD SILL", "at": [x, y], "width": 12, "tip": [x, y], "arrow": "filled" },
//     { "kind": "dim", "mode": "ortho", "p1": [x, y], "p2": [x, y], "at": [x, y] }
//   ]
// }
// weight: w1 extra fine, w2 fine (default), w3 medium, w4 heavy. pen: ink (default), red, blue, yellow, green.
// hatch pattern: any key in SK.HATCHES (concrete, wood1, insulation, cmu, steel, ...).
// note: text is wrapped to width; the box top-left is at; tip is where the arrow points. Optional "tips": [[x, y], ...] for more arrows.
// dim: mode ortho (horizontal or vertical, read from the drag) or aligned. at is a point on the dimension line's offset side.
(function (root) {
  'use strict';

  var SK = root.SK || {};

  function fail(msg) { throw new Error('Drawing spec: ' + msg); }

  function point(p, where) {
    if (!Array.isArray(p) || p.length < 2 || !isFinite(p[0]) || !isFinite(p[1])) fail(where + ' needs a point [x, y] in inches');
    return [Number(p[0]), Number(p[1])];
  }

  function pointList(pts, where, min) {
    if (!Array.isArray(pts) || pts.length < min) fail(where + ' needs at least ' + min + ' points');
    return pts.map(function (p) { return point(p, where); });
  }

  function penOf(name, where) {
    var key = name || 'ink';
    if (key !== 'ink' && !SK.PENS[key]) fail(where + ' has an unknown pen "' + key + '" (use ink, red, blue, yellow or green)');
    return key;
  }

  function weightOf(name, where) {
    var key = name || 'w2';
    if (!SK.WEIGHTS[key]) fail(where + ' has an unknown weight "' + key + '" (use w1, w2, w3 or w4)');
    return key;
  }

  // A stroke: the same shape the pen makes, with no pressure or timing. The page smooths strokes through their points,
  // so each interior corner is listed twice: the smoothing then keeps the corner sharp.
  function stroke(id, pts, weight, pen, f) {
    var out = [];
    pts.forEach(function (p, i) {
      out.push([p[0], p[1], 0.5, 0]);
      if (i > 0 && i < pts.length - 1) out.push([p[0], p[1], 0.5, 0]);
    });
    return { id: id, kind: 'stroke', t0: 0, w: SK.WEIGHTS[weight] * f, c: pen, pts: out };
  }

  // Builds the sheet items for one spec entry. n is a running count, so every id in the detail is unique.
  function buildItem(src, n, f, where) {
    var id = 'j' + n;
    var pen = penOf(src.pen, where);
    if (src.kind === 'line') {
      return stroke(id, pointList(src.pts, where, 2), weightOf(src.weight, where), pen, f);
    }
    if (src.kind === 'rect') {
      var x = Number(src.x), y = Number(src.y), w = Number(src.w), h = Number(src.h);
      if (![x, y, w, h].every(isFinite) || !(w > 0) || !(h > 0)) fail(where + ' rect needs x, y, and a positive w and h');
      var box = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
      return stroke(id, box, weightOf(src.weight, where), pen, f);
    }
    if (src.kind === 'hatch') {
      if (!SK.hatchOf || !SK.hatchOf(src.pattern)) fail(where + ' has an unknown hatch pattern "' + src.pattern + '"');
      return {
        id: id, kind: 'hatch', pattern: src.pattern, pts: pointList(src.pts, where, 3),
        outline: src.outline !== false, c: pen
      };
    }
    if (src.kind === 'note') {
      var width = Number(src.width);
      if (!(width > 0)) fail(where + ' note needs a positive width in inches');
      var tips = (src.tips || []).concat(src.tip ? [src.tip] : []);
      if (!tips.length) fail(where + ' note needs a tip (where the arrow points)');
      return {
        id: id, kind: 'note', text: String(src.text || ''), c: pen,
        at: point(src.at, where + ' note at'), width: width, height: null,
        size: SK.PAPER.text, justify: 'auto',
        leaders: tips.map(function (t, i) {
          return { id: id + 'l' + i, tip: point(t, where + ' note tip'), bends: [], arrow: src.arrow || 'filled' };
        })
      };
    }
    if (src.kind === 'dim') {
      var mode = src.mode || 'ortho';
      if (mode !== 'ortho' && mode !== 'aligned') fail(where + ' dim mode must be ortho or aligned');
      var d = {
        id: id, kind: 'dim', mode: mode, at: point(src.at, where + ' dim at'), text: null,
        size: SK.PAPER.text, end: src.end || 'tick', roundTo: null, c: pen,
        p1: point(src.p1, where + ' dim p1'), p2: point(src.p2, where + ' dim p2')
      };
      if (mode === 'ortho') d.orient = SK.orthoOrient(d.p1, d.p2, d.at);
      return d;
    }
    fail(where + ' has an unknown kind "' + src.kind + '" (use line, rect, hatch, note or dim)');
  }

  // A complete detail from a spec. Throws an Error that says what is wrong, so the caller can correct the spec.
  // A parallel (see sketch/parallel.js) works too: its spec is used.
  SK.authorDetail = function (spec) {
    if (!spec || typeof spec !== 'object') fail('expected an object with "items"');
    if (spec.schema === 'quick-detail/parallel-1' && spec.spec) spec = spec.spec;
    if (!Array.isArray(spec.items) || !spec.items.length) fail('"items" must be a non-empty list');
    var scaleKey = spec.scale || SK.DEFAULT_SCALE;
    if (!SK.SCALES.some(function (s) { return s.key === scaleKey; })) fail('unknown scale "' + scaleKey + '"');
    var f = SK.scaleOf(scaleKey).factor;
    var items = spec.items.map(function (src, i) {
      if (!src || typeof src !== 'object') fail('item ' + (i + 1) + ' is not an object');
      return buildItem(src, i + 1, f, 'Item ' + (i + 1));
    });
    return {
      name: String(spec.name || 'Drawn detail'),
      scale: scaleKey,
      tags: Array.isArray(spec.tags) ? spec.tags.map(String) : [],
      items: items
    };
  };

  root.SK = SK;
  if (typeof module !== 'undefined' && module.exports) module.exports = SK;
})(typeof window !== 'undefined' ? window : globalThis);
