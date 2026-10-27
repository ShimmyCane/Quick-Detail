// Quick Detail — turns detail elements into drawing primitives in real-world units.
// Every output (screen, SVG, PDF, PNG, DXF) is drawn from this one list, so they always match.
//
// Primitive kinds:
//   path   { pts, closed, w, gray, dash, fill }    w and dash in paper mm, gray/fill 0 (black)..1 (white)
//   circle { c, r, w, gray, dash, fill }
//   arc    { c, r, a0, a1, w, gray, dash }         degrees, counter-clockwise from a0 to a1
//   text   { at, h, str, rot, anchor, gray }        h in real units, anchor start|middle|end
// Every primitive also carries el (element id) and layer (DXF layer name).
(function (QD) {
  'use strict';

  var G = QD.G;
  var P = {};

  P.ctx = function (detail, settings) {
    var ratio = QD.scaleRatio(detail.scale);
    var unitMM = detail.units === 'in' ? 25.4 : 1;
    var penMM = {};
    QD.PENS.forEach(function (p) { penMM[p.id] = (settings && settings.pens && settings.pens[p.id]) || p.mm; });
    return {
      detail: detail,
      ratio: ratio,
      unitMM: unitMM,
      penMM: penMM,
      // Paper millimeters -> real drawing units at this detail's scale.
      mm: function (v) { return v / ratio / unitMM; },
      textMM: (settings && settings.textMM) || 2.5
    };
  };

  function sanitizeLayer(s) { return String(s).toUpperCase().replace(/[^A-Z0-9_\-$]/g, '_').slice(0, 60); }

  function layerFor(el, pen) {
    var mat = el.meaning && el.meaning.material;
    return sanitizeLayer('QD-' + pen + (mat ? '-' + mat : ''));
  }

  function penStyle(cx, pen) {
    var p = QD.penById(pen);
    return { w: cx.penMM[p.id], gray: p.gray };
  }

  function base(cx, el, pen, extra) {
    var s = penStyle(cx, pen);
    var o = { el: el.id, layer: layerFor(el, pen), w: s.w, gray: s.gray, dash: QD.LINETYPES[el.graphics.linetype || 'continuous'] || null, fill: null };
    for (var k in extra) o[k] = extra[k];
    return o;
  }

  function textPrims(cx, el, at, str, rot, anchor, sizeMM, gray, pen) {
    var h = cx.mm(sizeMM || cx.textMM);
    var lines = String(str || '').split('\n');
    var out = [];
    var r = (rot || 0) * Math.PI / 180;
    lines.forEach(function (line, i) {
      // Lines stack downward along the text's own rotated axis.
      var off = i * h * 1.6;
      var p = [at[0] + off * Math.sin(r), at[1] - off * Math.cos(r)];
      out.push({ kind: 'text', el: el.id, layer: layerFor(el, pen || 'P1'), at: p, h: h, str: line, rot: rot || 0, anchor: anchor || 'start', gray: gray || 0 });
    });
    return out;
  }

  function hatchPrims(cx, el, poly) {
    var out = [];
    var hatch = QD.HATCHES[el.graphics.hatch || 'none'] || QD.HATCHES.none;
    var hpen = el.graphics.hatchPen || 'P1';
    var s = penStyle(cx, hpen);
    var layer = sanitizeLayer(layerFor(el, hpen) + '-HATCH');
    var gray = el.graphics.pen === 'S1' ? QD.penById('S1').gray : s.gray;
    if (hatch.fill != null) out.push({ kind: 'path', el: el.id, layer: layer, pts: poly, closed: true, w: 0, gray: gray, dash: null, fill: hatch.fill, fillOnly: true });
    hatch.families.forEach(function (f) {
      G.hatchLines(poly, f.angle, cx.mm(f.spacing)).forEach(function (seg) {
        out.push({ kind: 'path', el: el.id, layer: layer, pts: seg, closed: false, w: s.w, gray: gray, dash: null, fill: null });
      });
    });
    if (hatch.blockingX) {
      var b = G.bounds(poly);
      [[[b.minx, b.miny], [b.maxx, b.maxy]], [[b.minx, b.maxy], [b.maxx, b.miny]]].forEach(function (d) {
        G.clipSegment(d[0], d[1], poly).forEach(function (seg) {
          out.push({ kind: 'path', el: el.id, layer: layer, pts: seg, closed: false, w: s.w, gray: gray, dash: null, fill: null });
        });
      });
    }
    if (hatch.dots) {
      var bb = G.bounds(poly);
      var rand = G.rng(G.hashString(el.id));
      var step = cx.mm(hatch.dots);
      var rr = cx.mm(0.18);
      for (var y = bb.miny + step / 2; y < bb.maxy; y += step) {
        for (var x = bb.minx + step / 2; x < bb.maxx; x += step) {
          var p = [x + (rand() - 0.5) * step * 0.8, y + (rand() - 0.5) * step * 0.8];
          if (G.pointInPoly(p, poly)) out.push({ kind: 'circle', el: el.id, layer: layer, c: p, r: rr, w: 0, gray: gray, dash: null, fill: gray });
        }
      }
    }
    return out;
  }

  function arrowPrims(cx, el, tip, from, style) {
    var s = penStyle(cx, el.graphics.pen);
    if (style === 'none') return [];
    if (style === 'dot') return [{ kind: 'circle', el: el.id, layer: layerFor(el, el.graphics.pen), c: tip, r: cx.mm(0.6), w: 0, gray: s.gray, dash: null, fill: s.gray }];
    var ang = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
    var L = cx.mm(2.2), W = cx.mm(0.75);
    var bx = tip[0] - L * Math.cos(ang), by = tip[1] - L * Math.sin(ang);
    var nx = -Math.sin(ang) * W, ny = Math.cos(ang) * W;
    return [{ kind: 'path', el: el.id, layer: layerFor(el, el.graphics.pen), pts: [tip, [bx + nx, by + ny], [bx - nx, by - ny]], closed: true, w: 0, gray: s.gray, dash: null, fill: s.gray, fillOnly: true }];
  }

  function dimensionPrims(cx, el) {
    var g = el.geometry, gr = el.graphics;
    var a = g.points[0], b = g.points[1];
    var ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    var nx = -Math.sin(ang), ny = Math.cos(ang);
    var off = g.offset || 0;
    var sgn = off >= 0 ? 1 : -1;
    var A = [a[0] + nx * off, a[1] + ny * off], B = [b[0] + nx * off, b[1] + ny * off];
    var gap = cx.mm(1), over = cx.mm(1.5);
    var out = [];
    var pen = gr.pen || 'P1';
    function line(p, q) { out.push(base(cx, el, pen, { kind: 'path', pts: [p, q], closed: false, dash: null })); }
    if (Math.abs(off) > gap) {
      line([a[0] + nx * gap * sgn, a[1] + ny * gap * sgn], [A[0] + nx * over * sgn, A[1] + ny * over * sgn]);
      line([b[0] + nx * gap * sgn, b[1] + ny * gap * sgn], [B[0] + nx * over * sgn, B[1] + ny * over * sgn]);
    }
    var ext = cx.mm(1.2);
    line([A[0] - Math.cos(ang) * ext, A[1] - Math.sin(ang) * ext], [B[0] + Math.cos(ang) * ext, B[1] + Math.sin(ang) * ext]);
    // Architectural slash ticks.
    var t = cx.mm(1.25);
    var ta = ang + Math.PI / 4;
    [A, B].forEach(function (p) {
      out.push(base(cx, el, 'P3', { kind: 'path', pts: [[p[0] - Math.cos(ta) * t, p[1] - Math.sin(ta) * t], [p[0] + Math.cos(ta) * t, p[1] + Math.sin(ta) * t]], closed: false, dash: null, layer: layerFor(el, pen) }));
    });
    var txt = gr.text || G.formatLength(G.dist(a, b), cx.detail.units);
    var deg = ang * 180 / Math.PI;
    var up = deg > 90 + 1e-6 || deg <= -90 + 1e-6;
    var rot = up ? deg + 180 : deg;
    var rr = rot * Math.PI / 180;
    var lift = cx.mm(0.9);
    var mid = [(A[0] + B[0]) / 2 - Math.sin(rr) * lift, (A[1] + B[1]) / 2 + Math.cos(rr) * lift];
    return out.concat(textPrims(cx, el, mid, txt, rot, 'middle', gr.size, 0, pen));
  }

  function breaklinePrims(cx, el) {
    var a = el.geometry.points[0], b = el.geometry.points[1];
    var L = G.dist(a, b);
    var ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    var ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
    var z = Math.min(cx.mm(2.5), L / 4), m = L / 2;
    var pts = [a,
      [a[0] + ux * (m - z / 2), a[1] + uy * (m - z / 2)],
      [a[0] + ux * (m - z / 4) + nx * z, a[1] + uy * (m - z / 4) + ny * z],
      [a[0] + ux * (m + z / 4) - nx * z, a[1] + uy * (m + z / 4) - ny * z],
      [a[0] + ux * (m + z / 2), a[1] + uy * (m + z / 2)],
      b];
    return [base(cx, el, el.graphics.pen || 'P2', { kind: 'path', pts: pts, closed: false })];
  }

  P.element = function (cx, el) {
    var g = el.geometry, gr = el.graphics;
    var pen = gr.pen;
    switch (g.type) {
      case 'line':
      case 'polyline':
        return [base(cx, el, pen, { kind: 'path', pts: g.points, closed: !!g.closed })];
      case 'region': {
        var out = hatchPrims(cx, el, g.points);
        if (gr.boundary !== false) out.push(base(cx, el, pen, { kind: 'path', pts: g.points, closed: true }));
        return out;
      }
      case 'circle':
        return [base(cx, el, pen, { kind: 'circle', c: g.center, r: g.radius })];
      case 'arc':
        return [base(cx, el, pen, { kind: 'arc', c: g.center, r: g.radius, a0: g.start, a1: g.end })];
      case 'text':
        return textPrims(cx, el, g.at, gr.text, gr.rotation || 0, gr.anchor || 'start', gr.size, QD.penById(pen).gray, pen);
      case 'leader': {
        var pts = g.points;
        var lp = [base(cx, el, pen, { kind: 'path', pts: pts, closed: false, dash: null })];
        return lp.concat(arrowPrims(cx, el, pts[pts.length - 1], pts[pts.length - 2], gr.arrow || 'arrow'));
      }
      case 'dimension':
        return dimensionPrims(cx, el);
      case 'breakline':
        return breaklinePrims(cx, el);
    }
    return [];
  };

  P.build = function (detail, settings, opts) {
    var cx = P.ctx(detail, settings);
    var out = [];
    var only = opts && opts.only;
    detail.elements.forEach(function (el) {
      if (only && only.indexOf(el.id) < 0) return;
      try { out = out.concat(P.element(cx, el)); }
      catch (e) { if (opts && opts.onError) opts.onError(el, e); }
    });
    return out;
  };

  P.primBounds = function (prims) {
    var pts = [];
    prims.forEach(function (p) {
      if (p.kind === 'path') pts = pts.concat(p.pts);
      else if (p.kind === 'circle' || p.kind === 'arc') { pts.push([p.c[0] - p.r, p.c[1] - p.r], [p.c[0] + p.r, p.c[1] + p.r]); }
      else if (p.kind === 'text') {
        var w = G.textWidth(p.str, p.h);
        var x0 = p.anchor === 'middle' ? -w / 2 : p.anchor === 'end' ? -w : 0;
        [[x0, 0], [x0 + w, 0], [x0, p.h], [x0 + w, p.h]].forEach(function (q) {
          pts.push(G.rotate([p.at[0] + q[0], p.at[1] + q[1]], p.rot, p.at));
        });
      }
    });
    if (!pts.length) return { minx: 0, miny: 0, maxx: 12, maxy: 12 };
    return G.bounds(pts);
  };

  // Title strip under the drawing: rule, title on the left, scale and date on the right.
  P.titleStrip = function (detail, settings, b) {
    var cx = P.ctx(detail, settings);
    var y = b.miny - cx.mm(6);
    var el = { id: '_title', meaning: null, graphics: { pen: 'P1' } };
    var out = [{ kind: 'path', el: '_title', layer: 'QD-TITLE', pts: [[b.minx, y], [b.maxx, y]], closed: false, w: cx.penMM.P4, gray: 0, dash: null, fill: null }];
    var date = (detail.modified || new Date().toISOString()).slice(0, 10);
    out = out.concat(textPrims(cx, el, [b.minx, y - cx.mm(5)], String(detail.title || '').toUpperCase(), 0, 'start', 3.5, 0));
    out = out.concat(textPrims(cx, el, [b.maxx, y - cx.mm(5)], 'SCALE: ' + detail.scale + '   ' + date, 0, 'end', 2.2, 0));
    out.forEach(function (p) { p.layer = 'QD-TITLE'; });
    return out;
  };

  // Primitives plus bounds for an export: optional title strip and a paper margin.
  P.forExport = function (detail, settings, opts) {
    var prims = P.build(detail, settings);
    var cx = P.ctx(detail, settings);
    var b = P.primBounds(prims);
    if (!opts || opts.title !== false) {
      prims = prims.concat(P.titleStrip(detail, settings, b));
      b = P.primBounds(prims);
    }
    var m = cx.mm((opts && opts.marginMM) != null ? opts.marginMM : 8);
    return { prims: prims, bounds: { minx: b.minx - m, miny: b.miny - m, maxx: b.maxx + m, maxy: b.maxy + m }, ctx: cx };
  };

  QD.P = P;
})(globalThis.QD = globalThis.QD || {});
