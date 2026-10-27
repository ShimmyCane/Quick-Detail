// Quick Detail — exporters: PDF (vector), DXF (R12, full size), PNG/JPEG (raster from SVG).
// All of them read the same primitives as the screen.
(function (QD) {
  'use strict';

  var G = QD.G;
  var X = {};

  function n(v) { return (Math.round(v * 10000) / 10000).toString(); }

  // ---------- PDF ----------

  function pdfStr(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      var ch = s[i];
      if (ch === '(' || ch === ')' || ch === '\\') out += '\\' + ch;
      else if (c >= 32 && c <= 126) out += ch;
      else out += '?';
    }
    return out;
  }

  X.pdf = function (detail, settings, opts) {
    var ex = QD.P.forExport(detail, settings, opts);
    var b = ex.bounds, cx = ex.ctx;
    var PT = 72 / 25.4;
    var k = cx.ratio * cx.unitMM * PT; // real units -> points
    var W = (b.maxx - b.minx) * k, H = (b.maxy - b.miny) * k;
    function X_(x) { return n((x - b.minx) * k); }
    function Y_(y) { return n((y - b.miny) * k); }
    var cs = [];
    cs.push('1 J 1 j');
    ex.prims.forEach(function (p) {
      var w = p.w ? p.w * PT : 0;
      var gray = n(p.gray || 0);
      var fill = p.fill != null ? n(p.fill) : null;
      cs.push(gray + ' G ' + (fill != null ? fill : gray) + ' g ' + n(w) + ' w');
      cs.push(p.dash && w ? '[' + p.dash.map(function (d) { return n(d * PT); }).join(' ') + '] 0 d' : '[] 0 d');
      var paint = (fill != null && !p.fillOnly && w) ? 'B' : (fill != null ? 'f' : 'S');
      if (p.kind === 'path') {
        if (p.closed && fill != null) paint = (w && !p.fillOnly) ? 'b' : 'f';
        else if (p.closed) paint = 's';
        var d = p.pts.map(function (q, i) { return X_(q[0]) + ' ' + Y_(q[1]) + (i ? ' l' : ' m'); }).join(' ');
        cs.push(d + ' ' + paint);
      } else if (p.kind === 'circle') {
        // Four Bézier quarter-arcs.
        var r = p.r, c = p.c, kk = 0.5522847498 * r;
        cs.push(X_(c[0] + r) + ' ' + Y_(c[1]) + ' m ' +
          X_(c[0] + r) + ' ' + Y_(c[1] + kk) + ' ' + X_(c[0] + kk) + ' ' + Y_(c[1] + r) + ' ' + X_(c[0]) + ' ' + Y_(c[1] + r) + ' c ' +
          X_(c[0] - kk) + ' ' + Y_(c[1] + r) + ' ' + X_(c[0] - r) + ' ' + Y_(c[1] + kk) + ' ' + X_(c[0] - r) + ' ' + Y_(c[1]) + ' c ' +
          X_(c[0] - r) + ' ' + Y_(c[1] - kk) + ' ' + X_(c[0] - kk) + ' ' + Y_(c[1] - r) + ' ' + X_(c[0]) + ' ' + Y_(c[1] - r) + ' c ' +
          X_(c[0] + kk) + ' ' + Y_(c[1] - r) + ' ' + X_(c[0] + r) + ' ' + Y_(c[1] - kk) + ' ' + X_(c[0] + r) + ' ' + Y_(c[1]) + ' c ' +
          (fill != null ? (w ? 'b' : 'f') : 's'));
      } else if (p.kind === 'arc') {
        var pts = G.arcPoints(p.c, p.r, p.a0, p.a1);
        cs.push(pts.map(function (q, i) { return X_(q[0]) + ' ' + Y_(q[1]) + (i ? ' l' : ' m'); }).join(' ') + ' S');
      } else if (p.kind === 'text') {
        var size = p.h / 0.72 * k;
        var tw = G.textWidth(p.str, p.h);
        var dx = p.anchor === 'middle' ? -tw / 2 : p.anchor === 'end' ? -tw : 0;
        var rad = (p.rot || 0) * Math.PI / 180, co = Math.cos(rad), si = Math.sin(rad);
        var ox = p.at[0] + dx * co, oy = p.at[1] + dx * si;
        cs.push('BT /F1 ' + n(size) + ' Tf ' + n(co) + ' ' + n(si) + ' ' + n(-si) + ' ' + n(co) + ' ' + X_(ox) + ' ' + Y_(oy) + ' Tm (' + pdfStr(p.str) + ') Tj ET');
      }
    });
    var content = cs.join('\n');
    var objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + n(W) + ' ' + n(H) + '] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream',
      '<< /Title (' + pdfStr(detail.title || '') + ') /Creator (Quick Detail) /Subject (' + pdfStr('Scale ' + detail.scale) + ') >>'
    ];
    var out = '%PDF-1.4\n';
    var offsets = [];
    objs.forEach(function (o, i) {
      offsets.push(out.length);
      out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n';
    });
    var xref = out.length;
    out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    offsets.forEach(function (o) { out += ('0000000000' + o).slice(-10) + ' 00000 n \n'; });
    out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R /Info 6 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    return out;
  };

  // ---------- DXF (R12 / AC1009, full size, layers carry pen + material) ----------

  X.dxf = function (detail, settings) {
    var cx = QD.P.ctx(detail, settings);
    var prims = QD.P.build(detail, settings);
    var b = QD.P.primBounds(prims);
    var L = [];
    function g(code, val) { L.push(String(code)); L.push(String(val)); }

    var layers = {};
    prims.forEach(function (p) { layers[p.layer] = true; });
    function layerColor(name) {
      var m = /^QD-(P[1-5]|S1)/.exec(name);
      return m ? QD.penById(m[1]).dxfColor : 7;
    }
    function ltypeFor(p) {
      if (!p.dash) return null;
      var d = JSON.stringify(p.dash);
      for (var k in QD.LINETYPES) if (JSON.stringify(QD.LINETYPES[k]) === d) return k.toUpperCase();
      return null;
    }

    g(0, 'SECTION'); g(2, 'HEADER');
    g(9, '$ACADVER'); g(1, 'AC1009');
    g(9, '$INSUNITS'); g(70, detail.units === 'in' ? 1 : 4);
    g(9, '$MEASUREMENT'); g(70, detail.units === 'in' ? 0 : 1);
    g(9, '$EXTMIN'); g(10, n(b.minx)); g(20, n(b.miny));
    g(9, '$EXTMAX'); g(10, n(b.maxx)); g(20, n(b.maxy));
    g(9, '$LTSCALE'); g(40, n(cx.mm(1)));
    g(0, 'ENDSEC');

    g(0, 'SECTION'); g(2, 'TABLES');
    g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 5);
    g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0);
    Object.keys(QD.LINETYPES).forEach(function (k) {
      var pat = QD.LINETYPES[k];
      if (!pat) return;
      g(0, 'LTYPE'); g(2, k.toUpperCase()); g(70, 0); g(3, k); g(72, 65); g(73, pat.length);
      g(40, n(pat.reduce(function (s, v) { return s + v; }, 0)));
      pat.forEach(function (v, i) { g(49, n(i % 2 ? -v : v)); });
    });
    g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'LAYER'); g(70, Object.keys(layers).length + 1);
    g(0, 'LAYER'); g(2, '0'); g(70, 0); g(62, 7); g(6, 'CONTINUOUS');
    Object.keys(layers).forEach(function (name) {
      g(0, 'LAYER'); g(2, name); g(70, 0); g(62, layerColor(name)); g(6, 'CONTINUOUS');
    });
    g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'STYLE'); g(70, 1);
    g(0, 'STYLE'); g(2, 'STANDARD'); g(70, 0); g(40, 0); g(41, 1); g(50, 0); g(71, 0); g(42, 0.2); g(3, 'txt'); g(4, '');
    g(0, 'ENDTAB');
    g(0, 'ENDSEC');

    g(0, 'SECTION'); g(2, 'ENTITIES');
    prims.forEach(function (p) {
      var lt = ltypeFor(p);
      function head(type) { g(0, type); g(8, p.layer); if (lt) g(6, lt); }
      if (p.kind === 'path') {
        if (p.fillOnly) {
          // Filled arrowheads become SOLIDs; screen/poché fills are left out (outline still exports).
          if (p.pts.length === 3) {
            head('SOLID');
            var q = p.pts;
            g(10, n(q[0][0])); g(20, n(q[0][1])); g(30, 0);
            g(11, n(q[1][0])); g(21, n(q[1][1])); g(31, 0);
            g(12, n(q[2][0])); g(22, n(q[2][1])); g(32, 0);
            g(13, n(q[2][0])); g(23, n(q[2][1])); g(33, 0);
          }
          return;
        }
        if (p.pts.length === 2 && !p.closed) {
          head('LINE');
          g(10, n(p.pts[0][0])); g(20, n(p.pts[0][1])); g(30, 0);
          g(11, n(p.pts[1][0])); g(21, n(p.pts[1][1])); g(31, 0);
        } else {
          head('POLYLINE'); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, p.closed ? 1 : 0);
          p.pts.forEach(function (q) { g(0, 'VERTEX'); g(8, p.layer); g(10, n(q[0])); g(20, n(q[1])); g(30, 0); });
          g(0, 'SEQEND'); g(8, p.layer);
        }
      } else if (p.kind === 'circle') {
        if (p.fill != null && !p.w) {
          // Filled dot as an R12 donut: closed polyline of two bulged vertices with width = radius.
          head('POLYLINE'); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, 1); g(40, n(p.r)); g(41, n(p.r));
          g(0, 'VERTEX'); g(8, p.layer); g(10, n(p.c[0] - p.r / 2)); g(20, n(p.c[1])); g(30, 0); g(42, 1);
          g(0, 'VERTEX'); g(8, p.layer); g(10, n(p.c[0] + p.r / 2)); g(20, n(p.c[1])); g(30, 0); g(42, 1);
          g(0, 'SEQEND'); g(8, p.layer);
        } else {
          head('CIRCLE'); g(10, n(p.c[0])); g(20, n(p.c[1])); g(30, 0); g(40, n(p.r));
        }
      } else if (p.kind === 'arc') {
        head('ARC'); g(10, n(p.c[0])); g(20, n(p.c[1])); g(30, 0); g(40, n(p.r)); g(50, n(p.a0)); g(51, n(p.a1));
      } else if (p.kind === 'text') {
        head('TEXT');
        g(10, n(p.at[0])); g(20, n(p.at[1])); g(30, 0);
        g(40, n(p.h)); g(1, p.str.replace(/[^\x20-\x7e]/g, '?'));
        if (p.rot) g(50, n(p.rot));
        var h72 = p.anchor === 'middle' ? 1 : p.anchor === 'end' ? 2 : 0;
        if (h72) { g(72, h72); g(11, n(p.at[0])); g(21, n(p.at[1])); g(31, 0); }
      }
    });
    g(0, 'ENDSEC');
    g(0, 'EOF');
    return L.join('\n') + '\n';
  };

  // ---------- Raster (browser only) ----------

  X.raster = function (detail, settings, type, dpi) {
    return new Promise(function (resolve, reject) {
      var svg = QD.S.document(detail, settings);
      var ex = QD.P.forExport(detail, settings);
      var b = ex.bounds, cx = ex.ctx;
      var inches = cx.ratio * cx.unitMM / 25.4;
      var w = Math.max(1, Math.round((b.maxx - b.minx) * inches * dpi));
      var h = Math.max(1, Math.round((b.maxy - b.miny) * inches * dpi));
      var maxSide = 8000;
      if (w > maxSide || h > maxSide) { var f = maxSide / Math.max(w, h); w = Math.round(w * f); h = Math.round(h * f); }
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var g2 = c.getContext('2d');
        g2.fillStyle = '#ffffff';
        g2.fillRect(0, 0, w, h);
        g2.drawImage(img, 0, 0, w, h);
        c.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error('Canvas export failed.')); }, type, 0.95);
      };
      img.onerror = function () { reject(new Error('Could not rasterize the SVG.')); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  };

  X.download = function (data, filename, mime) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };

  X.fileBase = function (detail) {
    return String(detail.title || 'detail').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'detail';
  };

  QD.X = X;
})(globalThis.QD = globalThis.QD || {});
