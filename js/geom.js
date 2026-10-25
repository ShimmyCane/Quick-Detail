// Quick Detail — geometry helpers: distances, polygons, hatch clipping, text metrics, length formatting.
(function (QD) {
  'use strict';

  var G = {};

  G.dist = function (a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); };

  G.distToSeg = function (p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var len2 = dx * dx + dy * dy;
    if (len2 === 0) return G.dist(p, a);
    var t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  };

  G.distToPolyline = function (p, pts, closed) {
    var best = Infinity;
    for (var i = 0; i < pts.length - 1; i++) best = Math.min(best, G.distToSeg(p, pts[i], pts[i + 1]));
    if (closed && pts.length > 2) best = Math.min(best, G.distToSeg(p, pts[pts.length - 1], pts[0]));
    if (pts.length === 1) best = G.dist(p, pts[0]);
    return best;
  };

  G.pointInPoly = function (p, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > p[1]) !== (yj > p[1])) && (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  };

  G.bounds = function (pts) {
    var b = { minx: Infinity, miny: Infinity, maxx: -Infinity, maxy: -Infinity };
    pts.forEach(function (p) {
      if (p[0] < b.minx) b.minx = p[0];
      if (p[1] < b.miny) b.miny = p[1];
      if (p[0] > b.maxx) b.maxx = p[0];
      if (p[1] > b.maxy) b.maxy = p[1];
    });
    return b;
  };

  G.rotate = function (p, deg, origin) {
    var o = origin || [0, 0];
    var r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    var x = p[0] - o[0], y = p[1] - o[1];
    return [o[0] + x * c - y * s, o[1] + x * s + y * c];
  };

  G.angleDeg = function (a, b) { return Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; };

  // Parallel hatch lines at `angle` with `spacing`, clipped to polygon by even-odd scanlines.
  G.hatchLines = function (poly, angle, spacing) {
    if (!poly || poly.length < 3 || !(spacing > 0)) return [];
    var rp = poly.map(function (p) { return G.rotate(p, -angle); });
    var b = G.bounds(rp);
    if ((b.maxy - b.miny) / spacing > 4000) return [];
    var segs = [];
    var start = Math.ceil(b.miny / spacing) * spacing;
    for (var y = start; y <= b.maxy; y += spacing) {
      var xs = [];
      for (var i = 0, j = rp.length - 1; i < rp.length; j = i++) {
        var a = rp[j], c = rp[i];
        if ((a[1] > y) !== (c[1] > y)) xs.push(a[0] + (y - a[1]) * (c[0] - a[0]) / (c[1] - a[1]));
      }
      xs.sort(function (m, n) { return m - n; });
      for (var k = 0; k + 1 < xs.length; k += 2) {
        if (xs[k + 1] - xs[k] < 1e-9) continue;
        segs.push([G.rotate([xs[k], y], angle), G.rotate([xs[k + 1], y], angle)]);
      }
    }
    return segs;
  };

  // Clip a single segment to a polygon (used for the wood blocking X).
  G.clipSegment = function (a, b, poly) {
    var ang = G.angleDeg(a, b);
    var ra = G.rotate(a, -ang), rb = G.rotate(b, -ang);
    var y = ra[1];
    var rp = poly.map(function (p) { return G.rotate(p, -ang); });
    var xs = [];
    for (var i = 0, j = rp.length - 1; i < rp.length; j = i++) {
      var p = rp[j], q = rp[i];
      if ((p[1] > y) !== (q[1] > y)) xs.push(p[0] + (y - p[1]) * (q[0] - p[0]) / (q[1] - p[1]));
    }
    xs.sort(function (m, n) { return m - n; });
    var lo = Math.min(ra[0], rb[0]), hi = Math.max(ra[0], rb[0]);
    var out = [];
    for (var k = 0; k + 1 < xs.length; k += 2) {
      var s = Math.max(lo, xs[k]), e = Math.min(hi, xs[k + 1]);
      if (e > s) out.push([G.rotate([s, y], ang), G.rotate([e, y], ang)]);
    }
    return out;
  };

  // Small deterministic random generator so hatch dots never shift between renders.
  G.rng = function (seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  G.hashString = function (s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };

  G.arcPoints = function (c, r, a0, a1, segs) {
    var sweep = a1 - a0;
    while (sweep <= 0) sweep += 360;
    var n = segs || Math.max(8, Math.ceil(sweep / 6));
    var pts = [];
    for (var i = 0; i <= n; i++) {
      var a = (a0 + sweep * i / n) * Math.PI / 180;
      pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
    }
    return pts;
  };

  // Helvetica advance widths (per 1000 em) for ASCII 32..126. Shared by SVG, PDF and hit tests.
  var HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];

  G.textWidth = function (str, h) {
    var w = 0;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      w += (c >= 32 && c <= 126) ? HELV[c - 32] : 556;
    }
    // Cap height is about 0.72 em, and text height h is the cap height.
    return w / 1000 * (h / 0.72);
  };

  function gcd(a, b) { return b ? gcd(b, a % b) : a; }

  // Architectural length text: 1'-3 1/2" (to 1/16") or whole millimeters.
  G.formatLength = function (v, units) {
    if (units === 'mm') return String(Math.round(v));
    var sixteenths = Math.round(Math.abs(v) * 16);
    var feet = Math.floor(sixteenths / 192);
    var rem = sixteenths - feet * 192;
    var inches = Math.floor(rem / 16);
    var frac = rem - inches * 16;
    var fracText = '';
    if (frac) { var g = gcd(frac, 16); fracText = (frac / g) + '/' + (16 / g); }
    var inText = inches ? String(inches) + (fracText ? ' ' + fracText : '') : (fracText || '0');
    var sign = v < 0 ? '-' : '';
    return sign + (feet ? feet + "'-" + inText + '"' : inText + '"');
  };

  G.fmtNum = function (v) { return String(Math.round(v * 10000) / 10000); };

  QD.G = G;
})(globalThis.QD = globalThis.QD || {});
