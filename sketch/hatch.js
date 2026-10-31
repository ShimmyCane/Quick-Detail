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
    { key: 'stone-classic', label: 'Stone, packed (classic)', packed: { tile: 2.4, rmin: 0.09, rmax: 0.17, gap: 0.035 } },
    { key: 'concrete-classic', label: 'Concrete, scattered dots and rotated triangles (classic)', scatter: { tile: 1.6, dmin: 0.13, dot: 0.012, tris: 10, size: 0.07, tmin: 0.1 } },
    { key: 'steel-classic', label: 'Steel, paired diagonal lines (classic)', fams: [{ a: -45, s: 0.28 }, { a: -45, s: 0.28, o: 0.05 }] }
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

  // Tileable random layouts. Every random hatch is generated in a square tile of side P (world inches) and
  // repeated, so a swatch of any size joins seamlessly. The random numbers come from a fixed seed, so the same tile
  // always draws the same way. Distances inside a tile wrap around its edges.
  function prng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function torusDist(a, b, P) {
    var dx = Math.abs(a[0] - b[0]), dy = Math.abs(a[1] - b[1]);
    dx = Math.min(dx, P - dx); dy = Math.min(dy, P - dy);
    return Math.hypot(dx, dy);
  }

  function bounds(poly) {
    var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    poly.forEach(function (p) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); });
    return [minx, miny, maxx, maxy];
  }

  // Packed stones, as a rubble wall: every point of the tile belongs to one stone (a Voronoi cell of a random seed).
  // Each cell is inset by half the gap on every side, so the white between stones is a thin, even route line.
  // Seeds are spread by dart throwing with a random radius each, so stones vary in size and location.
  function clipHalfPlane(poly, nx, ny, c) {
    // keep the part of the convex polygon where nx*x + ny*y <= c
    var out = [];
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length];
      var fa = nx * a[0] + ny * a[1] - c, fb = nx * b[0] + ny * b[1] - c;
      if (fa <= 0) out.push(a);
      if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) {
        var t = fa / (fa - fb);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  }

  function stoneCells(P, cfg) {
    var rnd = prng(20261031);
    var seeds = [];
    for (var n = 0; n < 20000 && seeds.length < 240; n++) {
      var r = cfg.rmin + (cfg.rmax - cfg.rmin) * rnd();
      var c = [rnd() * P, rnd() * P];
      if (seeds.every(function (q) { return torusDist(c, q.c, P) >= r + q.r; })) seeds.push({ c: c, r: r });
    }
    // every seed's copies in the 3 x 3 neighbouring tiles, so cells wrap across tile edges
    var copies = [];
    seeds.forEach(function (q) {
      for (var i = -1; i <= 1; i++) for (var j = -1; j <= 1; j++) copies.push([q.c[0] + i * P, q.c[1] + j * P]);
    });
    var cells = [];
    seeds.forEach(function (q) {
      var s0 = q.c;
      var cell = [[s0[0] - P, s0[1] - P], [s0[0] + P, s0[1] - P], [s0[0] + P, s0[1] + P], [s0[0] - P, s0[1] + P]];
      copies.forEach(function (t) {
        var dx = t[0] - s0[0], dy = t[1] - s0[1], L = Math.hypot(dx, dy);
        if (L < 1e-9 || L > 3 * P) return;
        var ux = dx / L, uy = dy / L;
        // bisector moved in by half the gap: u . (x - s0) <= L/2 - gap/2
        var c = ux * s0[0] + uy * s0[1] + (L / 2 - cfg.gap / 2);
        cell = clipHalfPlane(cell, ux, uy, c);
      });
      if (cell.length >= 3) cells.push(cell.map(function (v) { return [v[0] - s0[0], v[1] - s0[1]]; }).concat([[s0[0], s0[1]]]));
    });
    return cells;
  }

  function packedStones(poly, factor, cfg, m) {
    var P = cfg.tile * factor, out = [];
    var b = bounds(poly);
    var cells = stoneCells(P, { rmin: cfg.rmin * factor, rmax: cfg.rmax * factor, gap: cfg.gap * factor });
    var i0 = Math.floor(b[0] / P) - 1, i1 = Math.ceil(b[2] / P) + 1;
    var j0 = Math.floor(b[1] / P) - 1, j1 = Math.ceil(b[3] / P) + 1;
    cells.forEach(function (cell) {
      var rel = cell.slice(0, cell.length - 1), sc = cell[cell.length - 1];
      for (var i = i0; i <= i1; i++) for (var j = j0; j <= j1; j++) {
        var c = [sc[0] + i * P, sc[1] + j * P];
        var verts = rel.map(function (q) { return [c[0] + q[0], c[1] + q[1]]; });
        if (!verts.every(function (q) { return SK.pointInPoly(q, poly) && edgeDist(q, poly) > m; })) continue;
        out.push(verts.concat([verts[0]]));
      }
    });
    return out;
  }

  // Scattered dots (blue-noise: no two closer than dmin) and open triangles with random rotation, both tileable.
  function scatterTile(P, cfg) {
    var rnd = prng(20261031 + 7);
    var dots = [], tris = [];
    // triangles first, spaced apart and rotated at random
    for (var t = 0, guard = 0; t < cfg.tris && guard < 4000; guard++) {
      var q = [rnd() * P, rnd() * P];
      if (tris.every(function (u) { return torusDist(q, u.c, P) >= cfg.size * 2.4; })) { tris.push({ c: q, th: rnd() * 2 * Math.PI }); t++; }
    }
    // dots fill the rest, evenly spread (no two closer than dmin), and keep clear of each triangle
    for (var n = 0; n < 8000 && dots.length < 600; n++) {
      var c = [rnd() * P, rnd() * P];
      var inTri = tris.some(function (u) { return torusDist(c, u.c, P) < cfg.size + cfg.tmin; });
      if (!inTri && dots.every(function (d) { return torusDist(c, d, P) >= cfg.dmin; })) dots.push(c);
    }
    return { dots: dots, tris: tris };
  }

  function scatterSegments(poly, factor, cfg, m) {
    var P = cfg.tile * factor, dmin = cfg.dmin * factor, size = cfg.size * factor, out = [];
    var tile = scatterTile(P, { dmin: dmin, tris: cfg.tris, size: size, tmin: cfg.tmin * factor });
    var b = bounds(poly);
    var r = cfg.dot * factor;
    var i0 = Math.floor(b[0] / P) - 1, i1 = Math.ceil(b[2] / P) + 1;
    var j0 = Math.floor(b[1] / P) - 1, j1 = Math.ceil(b[3] / P) + 1;
    for (var i = i0; i <= i1; i++) for (var j = j0; j <= j1; j++) {
      var ox = i * P, oy = j * P;
      tile.dots.forEach(function (d) {
        var c = [d[0] + ox, d[1] + oy];
        if (SK.pointInPoly(c, poly) && edgeDist(c, poly) > m) out.push({ k: 'dot', c: c, r: r });
      });
      tile.tris.forEach(function (t) {
        var cx = t.c[0] + ox, cy = t.c[1] + oy;
        var v = [0, 1, 2].map(function (k) {
          var a = t.th + k * 2 * Math.PI / 3;
          return [cx + size * Math.cos(a), cy + size * Math.sin(a)];
        });
        var closed = v.concat([v[0]]);
        if (closed.every(function (q) { return SK.pointInPoly(q, poly) && edgeDist(q, poly) > m; })) out.push({ k: 'path', pts: closed });
      });
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
    if (h.packed) {
      packedStones(poly, factor, h.packed, m).forEach(function (pts) { out.push({ k: 'path', pts: pts }); });
    }
    if (h.scatter) {
      scatterSegments(poly, factor, h.scatter, m).forEach(function (p) { out.push(p); });
    }
    if (h.zig) {
      waveSegments(poly, h.zig.row * factor, h.zig.amp * factor, h.zig.period * factor, m).forEach(function (seg) { out.push({ k: 'path', pts: seg }); });
    }
    return out;
  };

  root.SK = SK;
  if (typeof module !== 'undefined' && module.exports) module.exports = SK;
})(typeof window !== 'undefined' ? window : globalThis);
