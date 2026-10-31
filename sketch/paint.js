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

  // Images by source, loaded once. SK.onImageLoad runs when one finishes, so the page can repaint.
  var images = {};
  function imageOf(src) {
    var im = images[src];
    if (!im) {
      im = images[src] = new Image();
      im.onload = function () { if (SK.onImageLoad) SK.onImageLoad(); };
      im.src = src;
    }
    return im.complete && im.naturalWidth ? im : null;
  }

  // Resolves once every image among the items has loaded (or failed), for pictures drawn once.
  SK.whenImages = function (items) {
    return Promise.all(items.filter(function (it) { return it.kind === 'image'; }).map(function (it) {
      imageOf(it.src);
      var im = images[it.src];
      if (im.complete) return null;
      return new Promise(function (resolve) { im.addEventListener('load', resolve); im.addEventListener('error', resolve); });
    }));
  };

  // Reference grid over the sheet, in screen space: one true inch per square. Its colours are shades of the background
  // (SK.gridShades): minor squares, and major lines every five squares. Screen only; exports never include it.
  SK.paintGrid = function (c, v, factor, w, h, ratio, bg) {
    var step = SK.gridStep(factor);
    while (step * v.z < 5) step *= 2;
    var shades = SK.gridShades(bg), MAJOR = 5;
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    c.lineWidth = Math.max(0.5, 0.5 * SK.WEIGHTS.w1 * factor * v.z);   // half the thinnest drawn line, on screen
    var i0 = Math.floor(v.x / step), i1 = Math.ceil((v.x + w / v.z) / step);
    for (var i = i0; i <= i1; i++) {
      var sx = Math.round((i * step - v.x) * v.z) + 0.5;
      c.strokeStyle = ((i % MAJOR) + MAJOR) % MAJOR === 0 ? shades.major : shades.minor;
      c.beginPath(); c.moveTo(sx, 0); c.lineTo(sx, h); c.stroke();
    }
    var j0 = Math.floor(v.y / step), j1 = Math.ceil((v.y + h / v.z) / step);
    for (var j = j0; j <= j1; j++) {
      var sy = Math.round((j * step - v.y) * v.z) + 0.5;
      c.strokeStyle = ((j % MAJOR) + MAJOR) % MAJOR === 0 ? shades.major : shades.minor;
      c.beginPath(); c.moveTo(0, sy); c.lineTo(w, sy); c.stroke();
    }
  };

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
    var annoW = Math.max(SK.PAPER.line * ac.factor * v.z, 0.75);

    // Images sit under the linework. A no-print image (an underlay) shows faintly on screen; it is left out when
    // opts.print is set, and when opts.hideUnderlay is set (hidden by hand).
    items.forEach(function (it) {
      if (it.kind !== 'image' || (it.noPrint && (opts.print || opts.hideUnderlay))) return;
      var im = imageOf(it.src);
      if (!im) return;
      var s = SK.toScreen(v, it.at);
      c.globalAlpha = (it.noPrint ? 0.55 : 1) * (opts.alpha == null ? 1 : opts.alpha);
      c.drawImage(im, s[0], s[1], it.w * v.z, it.h * v.z);
    });
    c.globalAlpha = 1;

    items.forEach(function (it) {
      if (it.kind === 'image') return;
      var ink = opts.mono ? opts.ink : opts.bg ? SK.inkFor(it.c, opts.bg) : opts.ink;   // mono: every pen in ink
      c.strokeStyle = ink;
      c.fillStyle = ink;
      c.globalAlpha = opts.faded && opts.faded.indexOf(it.id) >= 0 ? 0.35 : (opts.alpha == null ? 1 : opts.alpha);
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
    SK.paint(cv.getContext('2d'), items, v, { ac: opts.ac, ink: opts.ink, paper: opts.paper, bg: opts.paper, w: w, h: h, mono: opts.mono, print: opts.print });
    return cv;
  };

  root.SK = SK;
})(window);
