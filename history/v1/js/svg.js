// Quick Detail — primitives -> SVG markup. Used for the live canvas and for SVG/PNG export.
// Drawing space is y-up; SVG is y-down, so every y is negated here and only here.
(function (QD) {
  'use strict';

  var S = {};

  function n(v) { return Math.round(v * 10000) / 10000; }
  function col(g) { var c = Math.round((g || 0) * 255); return 'rgb(' + c + ',' + c + ',' + c + ')'; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // cx: primitives context (for mm -> real). opts.minStroke: smallest stroke in real units (screen only).
  S.prims = function (prims, cx, opts) {
    var minStroke = (opts && opts.minStroke) || 0;
    var out = [];
    prims.forEach(function (p) {
      var sw = p.w ? Math.max(cx.mm(p.w), minStroke) : 0;
      var stroke = sw ? ' stroke="' + col(p.gray) + '" stroke-width="' + n(sw) + '"' : ' stroke="none"';
      var dash = p.dash && sw ? ' stroke-dasharray="' + p.dash.map(function (d) { return n(cx.mm(d)); }).join(' ') + '"' : '';
      var fill = p.fill != null ? ' fill="' + col(p.fill) + '"' : ' fill="none"';
      var data = opts && opts.tagElements ? ' data-el="' + esc(p.el) + '"' : '';
      if (p.kind === 'path') {
        if (p.fillOnly) stroke = ' stroke="none"';
        var d = p.pts.map(function (q, i) { return (i ? 'L' : 'M') + n(q[0]) + ' ' + n(-q[1]); }).join('') + (p.closed ? 'Z' : '');
        out.push('<path d="' + d + '"' + stroke + dash + fill + ' stroke-linejoin="round" stroke-linecap="round"' + data + '/>');
      } else if (p.kind === 'circle') {
        out.push('<circle cx="' + n(p.c[0]) + '" cy="' + n(-p.c[1]) + '" r="' + n(p.r) + '"' + stroke + dash + fill + data + '/>');
      } else if (p.kind === 'arc') {
        var sweep = p.a1 - p.a0;
        while (sweep <= 0) sweep += 360;
        var a0 = p.a0 * Math.PI / 180, a1 = (p.a0 + sweep) * Math.PI / 180;
        var x0 = p.c[0] + p.r * Math.cos(a0), y0 = p.c[1] + p.r * Math.sin(a0);
        var x1 = p.c[0] + p.r * Math.cos(a1), y1 = p.c[1] + p.r * Math.sin(a1);
        // Counter-clockwise in y-up space is sweep-flag 0 in y-down SVG.
        var large = sweep > 180 ? 1 : 0;
        var dd = sweep >= 359.999
          ? 'M' + n(x0) + ' ' + n(-y0) + 'A' + n(p.r) + ' ' + n(p.r) + ' 0 1 0 ' + n(2 * p.c[0] - x0) + ' ' + n(-(2 * p.c[1] - y0)) + 'A' + n(p.r) + ' ' + n(p.r) + ' 0 1 0 ' + n(x0) + ' ' + n(-y0)
          : 'M' + n(x0) + ' ' + n(-y0) + 'A' + n(p.r) + ' ' + n(p.r) + ' 0 ' + large + ' 0 ' + n(x1) + ' ' + n(-y1);
        out.push('<path d="' + dd + '"' + stroke + dash + ' fill="none" stroke-linecap="round"' + data + '/>');
      } else if (p.kind === 'text') {
        var anchor = p.anchor === 'middle' ? 'middle' : p.anchor === 'end' ? 'end' : 'start';
        var x = n(p.at[0]), y = n(-p.at[1]);
        var rot = p.rot ? ' transform="rotate(' + n(-p.rot) + ' ' + x + ' ' + y + ')"' : '';
        out.push('<text x="' + x + '" y="' + y + '" font-family="Helvetica, Arial, sans-serif" font-size="' + n(p.h / 0.72) + '" text-anchor="' + anchor + '" fill="' + col(p.gray) + '"' + rot + data + ' xml:space="preserve">' + esc(p.str) + '</text>');
      }
    });
    return out.join('\n');
  };

  // A standalone SVG document sized to paper millimeters at the detail's scale.
  S.document = function (detail, settings, opts) {
    var ex = QD.P.forExport(detail, settings, opts);
    var b = ex.bounds, cx = ex.ctx;
    var wReal = b.maxx - b.minx, hReal = b.maxy - b.miny;
    var toMM = cx.ratio * cx.unitMM;
    var body = S.prims(ex.prims, cx, {});
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + n(wReal * toMM) + 'mm" height="' + n(hReal * toMM) + 'mm" viewBox="' +
      n(b.minx) + ' ' + n(-b.maxy) + ' ' + n(wReal) + ' ' + n(hReal) + '">\n' +
      '<title>' + esc(detail.title) + '</title>\n' +
      '<rect x="' + n(b.minx) + '" y="' + n(-b.maxy) + '" width="' + n(wReal) + '" height="' + n(hReal) + '" fill="#ffffff"/>\n' +
      body + '\n</svg>\n';
  };

  QD.S = S;
})(globalThis.QD = globalThis.QD || {});
