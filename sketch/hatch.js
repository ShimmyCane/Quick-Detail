// Quick Detail — hatch patterns. A hatch fills a closed region with a material pattern. Pure: runs in the page and in Node.
//
// Spacing is in paper inches, so a pattern looks the same at any scale; the real spacing is spacing × scale factor.
// The error margin keeps the fill off the boundary: every line stops a little short of the edge, and dots keep clear of it.
(function (root) {
  'use strict';

  var SK = root.SK || {};

  SK.HATCH_MARGIN_PAPER = 1 / 32;

  // Material hatches for section drawings, following the common conventions in architectural symbol references:
  // concrete is stippled; brick is a diagonal fill; wood and plywood are lines; batt insulation is a wavy line;
  // rigid insulation is a fine crosshatch; concrete block is a running bond; steel is solid.
  // fams: parallel line families (angle in degrees, spacing in paper inches).
  // zig: a wavy line in rows (row spacing, wave amplitude, wave period, all paper inches).
  // blocks: running bond (course height and block length in paper inches).
  // dots: stipple (spacing and radius in paper inches). solid: a filled region.
  SK.HATCHES = [
    { key: 'none', label: 'None' },
    { key: 'wood1', label: 'Wood, along the grain', fams: [{ a: 0, s: 0.16 }] },
    { key: 'wood2', label: 'Wood, cut across the grain', fams: [{ a: 45, s: 0.16 }] },
    { key: 'plywood', label: 'Plywood', fams: [{ a: 0, s: 0.22 }, { a: 90, s: 0.22 }] },
    { key: 'gypsum', label: 'Gypsum board', fams: [{ a: 45, s: 0.2 }] },
    { key: 'insulation', label: 'Insulation (grid)', fams: [{ a: 0, s: 0.3 }, { a: 90, s: 0.3 }] },
    { key: 'batt', label: 'Insulation, batt (wavy)', zig: { row: 0.26, amp: 0.07, period: 0.36 } },
    { key: 'rigid', label: 'Insulation, rigid board', fams: [{ a: 45, s: 0.12 }, { a: -45, s: 0.12 }] },
    { key: 'brick', label: 'Brick', fams: [{ a: 45, s: 0.22 }] },
    { key: 'cmu', label: 'Concrete block (running bond)', blocks: { h: 0.22, L: 0.44 } },
    { key: 'concrete', label: 'Concrete (stipple)', dots: 0.14, r: 0.012 },
    { key: 'gravel', label: 'Gravel', dots: 0.24, r: 0.02 },
    { key: 'earth', label: 'Earth', fams: [{ a: 30, s: 0.25 }, { a: -30, s: 0.25 }] },
    { key: 'screen', label: 'Screen (light tone)', dots: 0.06, r: 0.006 },
    { key: 'steel', label: 'Steel (solid)', solid: true },
    // Classic (building drawing symbols sheet), drawn from the sheet's look. Paper inches.
    { key: 'brick-classic', label: 'Brick, running bond (classic)', blocks: { h: 0.30, L: 0.60 } },
    { key: 'stone-classic', label: 'Stone, rubble (classic)', rubble: { cell: 0.45, r: 0.22 } },
    { key: 'concrete-classic', label: 'Concrete, dots and triangles (classic)', dots: 0.14, r: 0.012, tri: { cell: 0.5, size: 0.05 } },
    { key: 'steel-classic', label: 'Steel, paired diagonal lines (classic)', fams: [{ a: -45, s: 0.22 }, { a: -45, s: 0.22, o: 0.05 }] }
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

  // The stretches of the line through o with unit direction u that lie inside the polygon, as [t0, t1] along u.
  function clipLine(poly, o, u) {
    var n = [-u[1], u[0]];
    var c = n[0] * o[0] + n[1] * o[1];
    var ts = [];
    for (var i = 0; i < poly.length; i++) {
      var p = poly[i], q = poly[(i + 1) % poly.length];
      var sp = n[0] * p[0] + n[1] * p[1] - c, sq = n[0] * q[0] + n[1] * q[1] - c;
      if ((sp > 0) !== (sq > 0)) {
        var t = sp / (sp - sq);
        ts.push(u[0] * (p[0] + (q[0] - p[0]) * t) + u[1] * (p[1] + (q[1] - p[1]) * t) - (u[0] * o[0] + u[1] * o[1]));
      }
    }
    ts.sort(function (x, y) { return x - y; });
    var out = [];
    for (var j = 0; j + 1 < ts.length; j += 2) out.push([ts[j], ts[j + 1]]);
    return out;
  }

  // A segment is kept unless it lies along the boundary (a line on an edge is not hatch).
  function keep(s0, s1, poly) {
    var mid = [(s0[0] + s1[0]) / 2, (s0[1] + s1[1]) / 2];
    return edgeDist(mid, poly) > 1e-7;
  }

  // Parallel lines at angle a (degrees) with spacing d (world inches), clipped to the polygon.
  // Each line stops m short of its ends.
  function familySegments(poly, a, d, m, off) {
    var rad = a * Math.PI / 180;
    var u = [Math.cos(rad), Math.sin(rad)], n = [-Math.sin(rad), Math.cos(rad)];
    var lo = Infinity, hi = -Infinity, sh = off || 0;
    poly.forEach(function (p) { var v = n[0] * p[0] + n[1] * p[1]; lo = Math.min(lo, v); hi = Math.max(hi, v); });
    var out = [];
    for (var k = Math.ceil((lo - sh) / d); k * d + sh <= hi; k++) {
      var c = k * d + sh;
      var o = [n[0] * c, n[1] * c];
      clipLine(poly, o, u).forEach(function (iv) {
        var t0 = iv[0] + m, t1 = iv[1] - m;
        if (t1 <= t0) return;
        var s0 = [o[0] + u[0] * t0, o[1] + u[1] * t0];
        var s1 = [o[0] + u[0] * t1, o[1] + u[1] * t1];
        if (keep(s0, s1, poly)) out.push([s0, s1]);
      });
    }
    return out;
  }

  // Running bond: course lines every h, and block joints every L, offset by half a block on alternate courses.
  function blockSegments(poly, h, L, m) {
    var out = familySegments(poly, 0, h, m);
    var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    poly.forEach(function (p) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); });
    for (var r = Math.floor(miny / h); r * h <= maxy; r++) {
      var y0 = r * h, y1 = y0 + h;
      var off = (r % 2 === 0 ? 0 : 0.5);
      for (var i = Math.floor(minx / L) - 1; (i - off) * L <= maxx + L; i++) {
        var x = (i + off) * L;
        if (x < minx - 1e-9 || x > maxx + 1e-9) continue;
        clipLine(poly, [x, 0], [0, 1]).forEach(function (iv) {
          var a = Math.max(iv[0], y0) + m, b = Math.min(iv[1], y1) - m;
          if (b <= a) return;
          var s0 = [x, a], s1 = [x, b];
          if (keep(s0, s1, poly)) out.push([s0, s1]);
        });
      }
    }
    return out;
  }

  // Batt insulation: a wavy line in rows. Each little piece of wave is kept only where it is inside the region.
  function waveSegments(poly, row, amp, period, m) {
    var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    poly.forEach(function (p) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); });
    var out = [];
    var step = period / 8;
    for (var base = Math.ceil(miny / row) * row; base <= maxy; base += row) {
      var prev = null;
      for (var x = minx; x <= maxx + step; x += step) {
        var phase = ((x - minx) % period) / period;
        var tri = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
        var pt = [x, base + amp * (tri * 2 - 1)];
        if (prev && SK.pointInPoly(prev, poly) && SK.pointInPoly(pt, poly) && edgeDist(prev, poly) > m && edgeDist(pt, poly) > m) out.push([prev, pt]);
        prev = pt;
      }
    }
    return out;
  }

  // Stipple: one dot per cell, placed by a fixed hash so the same region always draws the same dots.
  function hash(i, j, salt) {
    var x = Math.sin(i * 127.1 + j * 311.7 + salt * 74.7) * 43758.5453;
    return x - Math.floor(x);
  }

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

  // Rubble: rounded seven-sided stones on a jittered grid. Some cells are left empty, so the background shows between stones.
  // Each stone is kept only where its whole outline lies inside the region, clear of the boundary.
  function rubbleStones(poly, cell, r, m) {
    var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    poly.forEach(function (p) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); });
    var out = [];
    for (var i = Math.floor(minx / cell) - 1; i * cell <= maxx + cell; i++) {
      for (var j = Math.floor(miny / cell) - 1; j * cell <= maxy + cell; j++) {
        if (hash(i, j, 6) < 0.15) continue;
        var c = [(i + 0.2 + 0.6 * hash(i, j, 4)) * cell, (j + 0.2 + 0.6 * hash(i, j, 5)) * cell];
        var rr = r * (0.7 + 0.3 * hash(i, j, 7));
        if (!SK.pointInPoly(c, poly) || edgeDist(c, poly) < rr * 1.15 + m) continue;
        var verts = [];
        for (var k = 0; k < 7; k++) {
          var ang = k * 2 * Math.PI / 7 + 0.3 * (hash(i, j, 10 + k) - 0.5);
          var rk = rr * (0.8 + 0.2 * hash(i, j, 20 + k));
          verts.push([c[0] + rk * Math.cos(ang), c[1] + rk * Math.sin(ang)]);
        }
        out.push(verts.concat([verts[0]]));
      }
    }
    return out;
  }

  // Open triangles scattered on a grid, about 60% of cells, each kept inside the region.
  function triangles(poly, cell, size, m) {
    var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    poly.forEach(function (p) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); });
    var out = [];
    for (var i = Math.floor(minx / cell); i * cell <= maxx + cell; i++) {
      for (var j = Math.floor(miny / cell); j * cell <= maxy + cell; j++) {
        if (hash(i, j, 3) > 0.6) continue;
        var x = (i + 0.2 + 0.6 * hash(i, j, 8)) * cell, y = (j + 0.2 + 0.6 * hash(i, j, 9)) * cell;
        var s = size;
        var t = [[x, y - s], [x + s * 0.866, y + s * 0.5], [x - s * 0.866, y + s * 0.5], [x, y - s]];
        if (t.every(function (q) { return SK.pointInPoly(q, poly) && edgeDist(q, poly) > m; })) out.push(t);
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
      familySegments(poly, f.a, f.s * factor, m, (f.o || 0) * factor).forEach(function (seg) { out.push({ k: 'path', pts: seg }); });
    });
    if (h.blocks) {
      blockSegments(poly, h.blocks.h * factor, h.blocks.L * factor, m).forEach(function (seg) { out.push({ k: 'path', pts: seg }); });
    }
    if (h.rubble) {
      rubbleStones(poly, h.rubble.cell * factor, h.rubble.r * factor, m).forEach(function (pts) { out.push({ k: 'path', pts: pts }); });
    }
    if (h.tri) {
      triangles(poly, h.tri.cell * factor, h.tri.size * factor, m).forEach(function (pts) { out.push({ k: 'path', pts: pts }); });
    }
    if (h.zig) {
      waveSegments(poly, h.zig.row * factor, h.zig.amp * factor, h.zig.period * factor, m).forEach(function (seg) { out.push({ k: 'path', pts: seg }); });
    }
    return out;
  };

  root.SK = SK;
  if (typeof module !== 'undefined' && module.exports) module.exports = SK;
})(typeof window !== 'undefined' ? window : globalThis);
