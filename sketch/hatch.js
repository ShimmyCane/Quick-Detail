// Quick Detail — hatch patterns. A hatch fills a closed region with a material pattern. Pure: runs in the page and in Node.
//
// Spacing is in paper inches, so a pattern looks the same at any scale; the real spacing is spacing × scale factor.
// The error margin keeps the fill off the boundary: every line stops a little short of the edge, and dots keep clear of it.
(function (root) {
  'use strict';

  var SK = root.SK || {};

  SK.HATCH_MARGIN_PAPER = 1 / 32;

  // fams: parallel line families (angle in degrees, spacing in paper inches).
  // dots: stipple (spacing in paper inches, radius in paper inches). solid: a filled region.
  SK.HATCHES = [
    { key: 'none', label: 'None' },
    { key: 'wood1', label: 'Wood, grain across', fams: [{ a: 0, s: 0.16 }] },
    { key: 'wood2', label: 'Wood, grain on the diagonal', fams: [{ a: 45, s: 0.16 }] },
    { key: 'plywood', label: 'Plywood', fams: [{ a: 0, s: 0.22 }, { a: 90, s: 0.22 }] },
    { key: 'gypsum', label: 'Gypsum board', fams: [{ a: 45, s: 0.2 }] },
    { key: 'insulation', label: 'Insulation (grid)', fams: [{ a: 0, s: 0.3 }, { a: 90, s: 0.3 }] },
    { key: 'cmu', label: 'Concrete block', fams: [{ a: 0, s: 0.4 }, { a: 90, s: 0.8 }] },
    { key: 'earth', label: 'Earth', fams: [{ a: 30, s: 0.25 }, { a: -30, s: 0.25 }] },
    { key: 'concrete', label: 'Concrete (stipple)', dots: 0.14, r: 0.012 },
    { key: 'screen', label: 'Screen (light tone)', dots: 0.06, r: 0.006 },
    { key: 'steel', label: 'Steel (solid)', solid: true }
  ];

  SK.hatchOf = function (key) {
    for (var i = 0; i < SK.HATCHES.length; i++) if (SK.HATCHES[i].key === key) return SK.HATCHES[i];
    return null;
  };

  // Even-odd point in polygon test.
  SK.pointInPoly = function (p, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[i], b = poly[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  };

  function segDist(p, a, b) {
    var abx = b[0] - a[0], aby = b[1] - a[1];
    var l2 = abx * abx + aby * aby;
    var t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / l2)) : 0;
    return Math.hypot(p[0] - a[0] - abx * t, p[1] - a[1] - aby * t);
  }

  function edgeDist(p, poly) {
    var best = Infinity;
    for (var i = 0; i < poly.length; i++) best = Math.min(best, segDist(p, poly[i], poly[(i + 1) % poly.length]));
    return best;
  }

  // Parallel lines at angle a (degrees) with spacing d (world inches), clipped to the polygon.
  // Each line stops m short of its ends. Lines lying on the boundary are left out.
  function familySegments(poly, a, d, m) {
    var rad = a * Math.PI / 180;
    var u = [Math.cos(rad), Math.sin(rad)], n = [-Math.sin(rad), Math.cos(rad)];
    var lo = Infinity, hi = -Infinity;
    poly.forEach(function (p) { var v = n[0] * p[0] + n[1] * p[1]; lo = Math.min(lo, v); hi = Math.max(hi, v); });
    var out = [];
    for (var k = Math.ceil(lo / d); k * d <= hi; k++) {
      var o = k * d;
      var ts = [];
      for (var i = 0; i < poly.length; i++) {
        var p = poly[i], q = poly[(i + 1) % poly.length];
        var sp = n[0] * p[0] + n[1] * p[1] - o, sq = n[0] * q[0] + n[1] * q[1] - o;
        if ((sp > 0) !== (sq > 0)) {
          var t = sp / (sp - sq);
          ts.push(u[0] * (p[0] + (q[0] - p[0]) * t) + u[1] * (p[1] + (q[1] - p[1]) * t));
        }
      }
      ts.sort(function (x, y) { return x - y; });
      for (var j = 0; j + 1 < ts.length; j += 2) {
        var t0 = ts[j] + m, t1 = ts[j + 1] - m;
        if (t1 <= t0) continue;
        var s0 = [n[0] * o + u[0] * t0, n[1] * o + u[1] * t0];
        var s1 = [n[0] * o + u[0] * t1, n[1] * o + u[1] * t1];
        var mid = [(s0[0] + s1[0]) / 2, (s0[1] + s1[1]) / 2];
        if (edgeDist(mid, poly) < 1e-7) continue;
        out.push([s0, s1]);
      }
    }
    return out;
  }

  function hash(i, j, salt) {
    var x = Math.sin(i * 127.1 + j * 311.7 + salt * 74.7) * 43758.5453;
    return x - Math.floor(x);
  }

  // Stipple: one dot per cell, placed by a fixed hash so the same region always draws the same dots.
  function dotPoints(poly, d, m) {
    var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    poly.forEach(function (p) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); });
    var out = [];
    for (var i = Math.floor(minx / d); i * d <= maxx + d; i++) {
      for (var j = Math.floor(miny / d); j * d <= maxy + d; j++) {
        var x = (i + 0.25 + 0.5 * hash(i, j, 1)) * d;
        var y = (j + 0.25 + 0.5 * hash(i, j, 2)) * d;
        if (SK.pointInPoly([x, y], poly) && edgeDist([x, y], poly) > m) out.push([x, y]);
      }
    }
    return out;
  }

  // The drawing primitives of a hatch item (see annot.js for the primitive kinds).
  // item: { kind: 'hatch', pattern, pts: [[x, y], ...] (closed polygon, world inches), outline: bool }
  SK.hatchPrims = function (item, factor) {
    var out = [];
    var poly = item.pts;
    if (item.outline && poly.length > 1) out.push({ k: 'path', pts: poly.concat([poly[0]]) });
    var h = SK.hatchOf(item.pattern);
    if (!h || poly.length < 3) return out;
    var m = SK.HATCH_MARGIN_PAPER * factor;
    if (h.solid) { out.push({ k: 'path', pts: poly, closed: true, fill: true }); return out; }
    if (h.dots) {
      dotPoints(poly, h.dots * factor, m).forEach(function (c) { out.push({ k: 'dot', c: c, r: h.r * factor }); });
    }
    (h.fams || []).forEach(function (f) {
      familySegments(poly, f.a, f.s * factor, m).forEach(function (seg) { out.push({ k: 'path', pts: seg }); });
    });
    return out;
  };

  root.SK = SK;
  if (typeof module !== 'undefined' && module.exports) module.exports = SK;
})(typeof window !== 'undefined' ? window : globalThis);
