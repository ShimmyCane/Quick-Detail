// Sketch v3 — painting items onto a canvas at a view, for the sheet, thumbnails and exports.
// A view is { x, y, z }: the world point (inches) at the top-left corner, and CSS pixels per world inch.
(function (root) {
  'use strict';

  var SK = root.SK || {};
  SK.FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

  var meter = document.createElement('canvas').getContext('2d');
  meter.font = '100px ' + SK.FONT;
  // Text width in world inches for a given text height.
  SK.measure = function (text, size) { return meter.measureText(text).width * size / 100; };

  SK.toScreen = function (v, p) { return [(p[0] - v.x) * v.z, (p[1] - v.y) * v.z]; };
  SK.toWorld = function (v, s) { return [s[0] / v.z + v.x, s[1] / v.z + v.y]; };

  // A view that fits bounds into w × h CSS pixels with a margin.
  SK.fitView = function (b, w, h, pad, maxZ) {
    if (!b) return null;
    var bw = Math.max(b.maxx - b.minx, 1e-3), bh = Math.max(b.maxy - b.miny, 1e-3);
    var z = Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh);
    if (maxZ) z = Math.min(z, maxZ);
    return { x: b.minx - (w / z - bw) / 2, y: b.miny - (h / z - bh) / 2, z: z };
  };

  function strokeWidth(s) {
    var sum = 0;
    s.pts.forEach(function (p) { sum += p[2]; });
    return s.w * (0.55 + 0.9 * sum / s.pts.length);
  }

  // Paints items. c is a 2D context whose transform maps CSS pixels to device pixels by `ratio`.
  // opts: { ac, ink, paper, fill (bool), dim (array of ids drawn faded), w, h }
  SK.paint = function (c, items, v, opts) {
    var ac = opts.ac, ratio = opts.ratio || 1;
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (opts.fill !== false) {
      c.fillStyle = opts.paper;
      c.fillRect(0, 0, opts.w, opts.h);
    }
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = opts.ink;
    c.fillStyle = opts.ink;
    var annoW = Math.max(SK.PAPER.line * ac.factor * v.z, 0.75);

    items.forEach(function (it) {
      c.globalAlpha = opts.faded && opts.faded.indexOf(it.id) >= 0 ? 0.35 : 1;
      if (it.kind === 'stroke') {
        var p = it.pts;
        if (!p.length) return;
        c.lineWidth = Math.max(strokeWidth(it) * v.z, 0.9);
        c.beginPath();
        var s0 = SK.toScreen(v, p[0]);
        c.moveTo(s0[0], s0[1]);
        if (p.length === 1) c.lineTo(s0[0] + 0.1, s0[1]);
        for (var i = 1; i < p.length - 1; i++) {
          var a = SK.toScreen(v, p[i]);
          var m = SK.toScreen(v, [(p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2]);
          c.quadraticCurveTo(a[0], a[1], m[0], m[1]);
        }
        if (p.length > 1) { var e = SK.toScreen(v, p[p.length - 1]); c.lineTo(e[0], e[1]); }
        c.stroke();
        return;
      }
      SK.itemPrims(it, ac).forEach(function (pr) { paintPrim(c, pr, v, annoW); });
    });
    c.globalAlpha = 1;
  };

  function paintPrim(c, pr, v, annoW) {
    if (pr.k === 'path') {
      c.lineWidth = annoW * (pr.heavy ? 2.4 : 1);
      c.beginPath();
      pr.pts.forEach(function (q, i) {
        var s = SK.toScreen(v, q);
        if (i) c.lineTo(s[0], s[1]); else c.moveTo(s[0], s[1]);
      });
      if (pr.closed) c.closePath();
      if (pr.fill) c.fill(); else c.stroke();
    } else if (pr.k === 'dot') {
      var sc = SK.toScreen(v, pr.c);
      c.beginPath();
      c.arc(sc[0], sc[1], Math.max(pr.r * v.z, 1), 0, Math.PI * 2);
      c.fill();
    } else if (pr.k === 'text') {
      var px = pr.size * v.z;
      if (px < 2) return;
      var st = SK.toScreen(v, pr.at);
      c.save();
      c.translate(st[0], st[1]);
      if (pr.rot) c.rotate(pr.rot);
      c.font = px + 'px ' + SK.FONT;
      c.textAlign = pr.align;
      c.textBaseline = 'alphabetic';
      c.fillText(pr.text, 0, 0);
      c.restore();
    }
  }

  // A canvas of items fitted to bounds b, for thumbnails and exports.
  SK.picture = function (items, b, w, h, opts) {
    var cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    var v = SK.fitView(b, w, h, opts.pad == null ? 8 : opts.pad, opts.maxZ) || { x: 0, y: 0, z: 1 };
    SK.paint(cv.getContext('2d'), items, v, { ac: opts.ac, ink: opts.ink, paper: opts.paper, w: w, h: h });
    return cv;
  };

  root.SK = SK;
})(window);
