// Sketch v3 — geometry for notes and dimensions, as drawing primitives in world inches.
// Pure: the page passes a context { factor, measure(text, size) -> width, caps, roundTo }.
//
// Primitives:
//   { k: 'path', pts, closed, fill }       lines (annotation weight) or a filled polygon
//   { k: 'dot', c, r }                     filled circle
//   { k: 'text', at, text, size, rot, align }   align: 'left' | 'center' | 'right'; at is on the baseline
(function (root) {
  'use strict';

  var SK = root.SK || {};
  var P = SK.PAPER;

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s]; }
  function len(a) { return Math.hypot(a[0], a[1]); }
  function unit(a) { var l = len(a); return l ? [a[0] / l, a[1] / l] : [1, 0]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  function rot(a, ang) {
    var c = Math.cos(ang), s = Math.sin(ang);
    return [a[0] * c - a[1] * s, a[0] * s + a[1] * c];
  }
  function mod(a, m) { return ((a % m) + m) % m; }
  // Reading angle for text along a direction: never upside down.
  function readable(ang) {
    while (ang > Math.PI / 2 + 1e-9) ang -= Math.PI;
    while (ang <= -Math.PI / 2 + 1e-9) ang += Math.PI;
    return ang;
  }

  SK.distToSeg = function (p, a, b) {
    var ab = sub(b, a), t = 0, l2 = dot(ab, ab);
    if (l2) t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
    return len(sub(p, add(a, mul(ab, t))));
  };
  SK.nearestOnSeg = function (p, a, b) {
    var ab = sub(b, a), t = 0, l2 = dot(ab, ab);
    if (l2) t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
    return add(a, mul(ab, t));
  };

  // ---------------------------------------------------------------
  // Arrowheads and terminators. The tip is the point; "from" is a point back along the line.
  // ---------------------------------------------------------------

  SK.ARROWS = [
    { key: 'filled', label: 'Filled arrow' },
    { key: 'open', label: 'Open arrow' },
    { key: 'closed', label: 'Hollow arrow' },
    { key: 'dot', label: 'Dot' },
    { key: 'tick', label: 'Tick' },
    { key: 'none', label: 'None' }
  ];

  SK.arrowPrims = function (tip, from, style, f) {
    var a = P.arrow * f;
    var u = unit(sub(tip, from));
    var n = [-u[1], u[0]];
    var base = sub(tip, mul(u, a));
    if (style === 'none') return [];
    if (style === 'dot') return [{ k: 'dot', c: tip, r: P.dot * f / 2 }];
    if (style === 'tick') {
      var d = rot(u, -Math.PI / 4);
      return [{ k: 'path', pts: [sub(tip, mul(d, a / 2)), add(tip, mul(d, a / 2))], heavy: true }];
    }
    if (style === 'open') {
      var w = a * 0.27;   // 30° included angle
      return [{ k: 'path', pts: [add(base, mul(n, w)), tip, sub(base, mul(n, w))] }];
    }
    return [{ k: 'path', pts: [tip, add(base, mul(n, a / 6)), sub(base, mul(n, a / 6))], closed: true, fill: style !== 'closed' }];
  };

  // ---------------------------------------------------------------
  // Notes
  // ---------------------------------------------------------------

  function wrap(text, width, size, measure) {
    var out = [];
    String(text).split('\n').forEach(function (para) {
      var words = para.split(/\s+/).filter(Boolean);
      if (!words.length) { out.push(''); return; }
      var line = words[0];
      for (var i = 1; i < words.length; i++) {
        var next = line + ' ' + words[i];
        if (measure(next, size) <= width) line = next;
        else { out.push(line); line = words[i]; }
      }
      out.push(line);
    });
    return out;
  }

  // Layout of a note: its box, its text lines and its leaders.
  // note: { id, kind: 'note', text, at: [x, y] top-left of the box, width, height (null = auto), size, justify, leaders: [{ id, tip, bends, arrow }] }
  SK.noteLayout = function (note, ac) {
    var f = ac.factor;
    var h = (note.size || P.text) * f;
    var lineH = h * 1.5;
    var text = ac.caps ? String(note.text).toUpperCase() : String(note.text);
    var lines = wrap(text, note.width, h, ac.measure);
    var autoH = Math.max(1, lines.length) * lineH;
    var boxH = note.height != null ? Math.max(lineH, note.height) : autoH;
    var fits = Math.max(1, Math.floor(boxH / lineH + 1e-6));
    if (lines.length > fits) {
      lines = lines.slice(0, fits);
      lines[fits - 1] += '…';
    }
    var x = note.at[0], y = note.at[1], w = note.width;
    var cx = x + w / 2;
    var leaders = note.leaders || [];
    var sides = leaders.map(function (ld) { return ld.tip[0] < cx ? 'left' : 'right'; });
    var align = note.justify && note.justify !== 'auto' ? note.justify
      : (sides.length && sides.every(function (s) { return s === 'right'; }) ? 'right' : 'left');

    var prims = [];
    lines.forEach(function (ln, i) {
      prims.push({ k: 'text', at: [align === 'right' ? x + w : x, y + i * lineH + h], text: ln, size: h, rot: 0, align: align });
    });

    var gap = h * 0.5, land = P.landing * f, ay = y + h * 0.6;
    var leaderPaths = leaders.map(function (ld, i) {
      var left = sides[i] === 'left';
      var attach = left ? [x - gap, ay] : [x + w + gap, ay];
      var landEnd = left ? [attach[0] - land, ay] : [attach[0] + land, ay];
      var pts = [ld.tip].concat(ld.bends || [], [landEnd, attach]);
      prims.push({ k: 'path', pts: pts });
      prims = prims.concat(SK.arrowPrims(ld.tip, pts[1], ld.arrow || 'filled', f));
      return pts;
    });

    return { prims: prims, box: { x: x, y: y, w: w, h: boxH }, lineH: lineH, size: h, align: align, leaderPaths: leaderPaths };
  };

  // ---------------------------------------------------------------
  // Dimensions
  // ---------------------------------------------------------------

  // Which way an ortho dimension runs, from where its line was dragged to (AutoCAD DIMLINEAR rule).
  SK.orthoOrient = function (p1, p2, at) {
    var minx = Math.min(p1[0], p2[0]), maxx = Math.max(p1[0], p2[0]);
    var miny = Math.min(p1[1], p2[1]), maxy = Math.max(p1[1], p2[1]);
    var outX = Math.max(0, minx - at[0], at[0] - maxx);
    var outY = Math.max(0, miny - at[1], at[1] - maxy);
    if (!outX && !outY) return (maxx - minx) >= (maxy - miny) ? 'h' : 'v';
    return outY >= outX ? 'h' : 'v';
  };

  // Measured value of a dimension: inches for linear, degrees for angular.
  SK.dimMeasure = function (d) {
    if (d.mode === 'angular') return angularArc(d).sweep * 180 / Math.PI;
    if (d.mode === 'ortho') return d.orient === 'v' ? Math.abs(d.p2[1] - d.p1[1]) : Math.abs(d.p2[0] - d.p1[0]);
    return len(sub(d.p2, d.p1));
  };

  // The text a dimension shows: measured and formatted, or the override with <> standing for the measured value.
  SK.dimText = function (d, ac) {
    var v = SK.dimMeasure(d);
    var measured = d.mode === 'angular' ? SK.formatAngle(v) : SK.formatLength(v, d.roundTo || ac.roundTo);
    if (d.text == null || d.text === '') return measured;
    return String(d.text).split('<>').join(measured);
  };

  function angularArc(d) {
    var V = d.vertex;
    var a1 = Math.atan2(d.p1[1] - V[1], d.p1[0] - V[0]);
    var a2 = Math.atan2(d.p2[1] - V[1], d.p2[0] - V[0]);
    var aa = Math.atan2(d.at[1] - V[1], d.at[0] - V[0]);
    var s12 = mod(a2 - a1, 2 * Math.PI);
    var inside = mod(aa - a1, 2 * Math.PI) <= s12;
    return {
      r: len(sub(d.at, V)),
      start: inside ? a1 : a2,
      sweep: inside ? s12 : 2 * Math.PI - s12
    };
  }

  function extLine(P0, A, gap, over) {
    var v = sub(A, P0), l = len(v);
    if (l <= gap) return null;
    var s = mul(v, 1 / l);
    return { k: 'path', pts: [add(P0, mul(s, gap)), add(A, mul(s, over))] };
  }

  // dim: { id, kind: 'dim', mode: 'ortho' | 'aligned' | 'angular', p1, p2, vertex, at, orient, text, size, end, roundTo }
  SK.dimLayout = function (d, ac) {
    var f = ac.factor;
    var gap = P.gap * f, over = P.over * f, h = (d.size || P.text) * f;
    var end = d.end || 'tick';
    var prims = [];
    var txt = SK.dimText(d, ac);

    if (d.mode === 'angular') {
      var V = d.vertex, arc = angularArc(d);
      [d.p1, d.p2].forEach(function (p) {
        var dp = len(sub(p, V));
        if (arc.r > dp + gap) {
          var dir = unit(sub(p, V));
          prims.push({ k: 'path', pts: [add(V, mul(dir, dp + gap)), add(V, mul(dir, arc.r + over))] });
        }
      });
      var n = Math.max(8, Math.ceil(arc.sweep / (Math.PI / 24)));
      var pts = [];
      for (var i = 0; i <= n; i++) {
        var a = arc.start + arc.sweep * i / n;
        pts.push([V[0] + arc.r * Math.cos(a), V[1] + arc.r * Math.sin(a)]);
      }
      prims.push({ k: 'path', pts: pts });
      var tS = [-Math.sin(arc.start), Math.cos(arc.start)];
      var aE = arc.start + arc.sweep;
      var tE = [-Math.sin(aE), Math.cos(aE)];
      prims = prims.concat(SK.arrowPrims(pts[0], add(pts[0], tS), end, f));
      prims = prims.concat(SK.arrowPrims(pts[n], sub(pts[n], tE), end, f));
      var m = arc.start + arc.sweep / 2;
      var out = [Math.cos(m), Math.sin(m)];
      var r = readable(m + Math.PI / 2);
      var up = [Math.sin(r), -Math.cos(r)];
      var at = add(V, mul(out, arc.r + gap));
      if (dot(up, out) < 0) at = add(at, mul(out, h));
      prims.push({ k: 'text', at: at, text: txt, size: h, rot: r, align: 'center' });
      return { prims: prims, A: pts[0], B: pts[n] };
    }

    var A, B;
    if (d.mode === 'ortho') {
      if (d.orient === 'v') { A = [d.at[0], d.p1[1]]; B = [d.at[0], d.p2[1]]; }
      else { A = [d.p1[0], d.at[1]]; B = [d.p2[0], d.at[1]]; }
    } else {
      var uu = unit(sub(d.p2, d.p1));
      var nn = [-uu[1], uu[0]];
      var off = dot(sub(d.at, d.p1), nn);
      A = add(d.p1, mul(nn, off));
      B = add(d.p2, mul(nn, off));
    }
    [extLine(d.p1, A, gap, over), extLine(d.p2, B, gap, over)].forEach(function (e) { if (e) prims.push(e); });

    var u = unit(sub(B, A));
    var past = end === 'tick' || end === 'dot' ? gap : 0;
    prims.push({ k: 'path', pts: [sub(A, mul(u, past)), add(B, mul(u, past))] });
    prims = prims.concat(SK.arrowPrims(A, add(A, u), end, f));
    prims = prims.concat(SK.arrowPrims(B, sub(B, u), end, f));

    var rr = readable(Math.atan2(u[1], u[0]));
    var lift = [Math.sin(rr) * gap, -Math.cos(rr) * gap];
    prims.push({ k: 'text', at: add(mul(add(A, B), 0.5), lift), text: txt, size: h, rot: rr, align: 'center' });
    return { prims: prims, A: A, B: B };
  };

  // ---------------------------------------------------------------
  // Items: primitives, bounds, hit testing, snap points
  // ---------------------------------------------------------------

  SK.itemPrims = function (item, ac) {
    if (item.kind === 'note') return SK.noteLayout(item, ac).prims;
    if (item.kind === 'dim') return SK.dimLayout(item, ac).prims;
    if (item.kind === 'hatch') return SK.hatchPrims(item, ac.factor);
    return [];
  };

  // Corners of a text primitive's box, in world inches.
  function textCorners(p, ac) {
    var w = ac.measure(p.text, p.size);
    var x0 = p.align === 'left' ? 0 : p.align === 'right' ? -w : -w / 2;
    var local = [[x0, -p.size], [x0 + w, -p.size], [x0 + w, p.size * 0.25], [x0, p.size * 0.25]];
    return local.map(function (q) { return add(p.at, rot(q, p.rot || 0)); });
  }

  function primsPoints(prims, ac) {
    var pts = [];
    prims.forEach(function (p) {
      if (p.k === 'path') pts = pts.concat(p.pts);
      else if (p.k === 'dot') pts.push([p.c[0] - p.r, p.c[1] - p.r], [p.c[0] + p.r, p.c[1] + p.r]);
      else if (p.k === 'text') pts = pts.concat(textCorners(p, ac));
    });
    return pts;
  }

  SK.boundsOf = function (pts) {
    if (!pts.length) return null;
    var b = { minx: Infinity, miny: Infinity, maxx: -Infinity, maxy: -Infinity };
    pts.forEach(function (p) {
      if (p[0] < b.minx) b.minx = p[0];
      if (p[1] < b.miny) b.miny = p[1];
      if (p[0] > b.maxx) b.maxx = p[0];
      if (p[1] > b.maxy) b.maxy = p[1];
    });
    return b;
  };

  // image: { id, kind: 'image', src (a JPEG data URL), at: [x, y] top-left, w, h (world inches), noPrint, name }
  // A no-print image is a reference on screen only; exports and prints leave it out.
  SK.printable = function (items) {
    return items.filter(function (it) { return !(it.kind === 'image' && it.noPrint); });
  };

  SK.itemBounds = function (item, ac) {
    if (item.kind === 'image') return { minx: item.at[0], miny: item.at[1], maxx: item.at[0] + item.w, maxy: item.at[1] + item.h };
    if (item.kind === 'stroke' || item.kind === 'hatch') return SK.boundsOf(item.pts);
    var pts = primsPoints(SK.itemPrims(item, ac), ac);
    if (item.kind === 'note') {
      var box = SK.noteLayout(item, ac).box;
      pts.push([box.x, box.y], [box.x + box.w, box.y + box.h]);
    }
    return SK.boundsOf(pts);
  };

  SK.itemsBounds = function (items, ac) {
    var pts = [];
    items.forEach(function (it) {
      var b = SK.itemBounds(it, ac);
      if (b) pts.push([b.minx, b.miny], [b.maxx, b.maxy]);
    });
    return SK.boundsOf(pts);
  };

  function pointInPoly(p, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[i], b = poly[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }

  function nearPath(p, pts, tol) {
    if (pts.length === 1) return len(sub(p, pts[0])) <= tol;
    for (var i = 1; i < pts.length; i++) if (SK.distToSeg(p, pts[i - 1], pts[i]) <= tol) return true;
    return false;
  }

  // Is world point p on the item, within tol world inches?
  SK.hitItem = function (item, p, tol, ac) {
    if (item.kind === 'image') {
      return p[0] >= item.at[0] - tol && p[0] <= item.at[0] + item.w + tol && p[1] >= item.at[1] - tol && p[1] <= item.at[1] + item.h + tol;
    }
    if (item.kind === 'stroke') return nearPath(p, item.pts, tol + (item.w || 0) / 2);
    if (item.kind === 'hatch') return pointInPoly(p, item.pts) || nearPath(p, item.pts.concat([item.pts[0]]), tol);
    if (item.kind === 'note') {
      var box = SK.noteLayout(item, ac).box;
      if (p[0] >= box.x - tol && p[0] <= box.x + box.w + tol && p[1] >= box.y - tol && p[1] <= box.y + box.h + tol) return true;
    }
    return SK.itemPrims(item, ac).some(function (pr) {
      if (pr.k === 'path') return nearPath(p, pr.pts, tol);
      if (pr.k === 'dot') return len(sub(p, pr.c)) <= pr.r + tol;
      if (pr.k === 'text') return pointInPoly(p, textCorners(pr, ac)) || nearPath(p, textCorners(pr, ac).concat([textCorners(pr, ac)[0]]), tol);
      return false;
    });
  };

  // Points worth snapping to: stroke ends, leader tips, dimension points.
  SK.snapPoints = function (items) {
    var pts = [];
    items.forEach(function (it) {
      if (it.kind === 'stroke' && it.pts.length) {
        pts.push(it.pts[0], it.pts[it.pts.length - 1]);
      } else if (it.kind === 'hatch') {
        pts = pts.concat(it.pts);
      } else if (it.kind === 'note') {
        (it.leaders || []).forEach(function (ld) { pts.push(ld.tip); });
      } else if (it.kind === 'dim') {
        pts.push(it.p1, it.p2);
        if (it.vertex) pts.push(it.vertex);
      }
    });
    return pts.map(function (q) { return [q[0], q[1]]; });
  };

  // Snap p to a nearby point: first a snap point within tol, then the nearest point on a stroke within tol.
  SK.snap = function (items, p, tol) {
    var best = null, bd = tol;
    SK.snapPoints(items).forEach(function (q) {
      var d = len(sub(p, q));
      if (d <= bd) { bd = d; best = q; }
    });
    if (best) return { p: best, kind: 'point' };
    bd = tol;
    items.forEach(function (it) {
      if (it.kind !== 'stroke') return;
      for (var i = 1; i < it.pts.length; i++) {
        var q = SK.nearestOnSeg(p, it.pts[i - 1], it.pts[i]);
        var d = len(sub(p, q));
        if (d <= bd) { bd = d; best = q; }
      }
    });
    return best ? { p: best, kind: 'line' } : { p: p, kind: null };
  };

  root.SK = SK;
  if (typeof module !== 'undefined' && module.exports) module.exports = SK;
})(typeof window !== 'undefined' ? window : globalThis);
