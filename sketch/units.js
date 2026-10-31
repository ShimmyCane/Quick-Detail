// Sketch v3 — scales and units. The sheet is drawn in real inches; the scale only sets how big notes,
// arrows and ticks are (they keep a fixed size on paper), and how big the sheet starts on screen.
(function (root) {
  'use strict';

  var SK = root.SK || {};

  // factor = real inches per paper inch.
  SK.SCALES = [
    { key: '6"=1\'-0"', label: '6" = 1\'-0"', factor: 2 },
    { key: '3"=1\'-0"', label: '3" = 1\'-0"', factor: 4 },
    { key: '1 1/2"=1\'-0"', label: '1 1/2" = 1\'-0"', factor: 8 },
    { key: '1"=1\'-0"', label: '1" = 1\'-0"', factor: 12 },
    { key: '3/4"=1\'-0"', label: '3/4" = 1\'-0"', factor: 16 },
    { key: '1/2"=1\'-0"', label: '1/2" = 1\'-0"', factor: 24 },
    { key: '1/4"=1\'-0"', label: '1/4" = 1\'-0"', factor: 48 },
    { key: 'Full size', label: 'Full size', factor: 1 },
    { key: 'NTS', label: 'Not to scale', factor: 4 }    // NTS keeps 3"=1' graphics
  ];
  SK.DEFAULT_SCALE = '3"=1\'-0"';

  SK.scaleOf = function (key) {
    for (var i = 0; i < SK.SCALES.length; i++) if (SK.SCALES[i].key === key) return SK.SCALES[i];
    return SK.scaleOf(SK.DEFAULT_SCALE);
  };

  // Sizes on paper, in inches. Multiply by the scale factor for world inches.
  SK.PAPER = {
    text: 3 / 32,      // note and dimension text height
    arrow: 1 / 8,      // arrowhead length, tick length
    dot: 1 / 16,       // dot terminator diameter
    landing: 1 / 8,    // horizontal shoulder of a leader
    gap: 1 / 16,       // extension line gap from the measured point; text lift above a dimension line
    over: 1 / 8,       // extension line past the dimension line
    line: 0.01         // annotation line weight
  };

  // On screen, one paper inch starts at this many CSS pixels.
  SK.SCREEN_PX_PER_PAPER_IN = 96;

  function gcd(a, b) { return b ? gcd(b, a % b) : a; }

  // Architectural length: 1'-3 1/2". roundTo is a fraction of an inch (1/16 by default).
  SK.formatLength = function (inches, roundTo) {
    var den = Math.round(1 / (roundTo || 1 / 16));
    var units = Math.round(Math.abs(inches) * den);
    var feet = Math.floor(units / (12 * den));
    var rem = units - feet * 12 * den;
    var whole = Math.floor(rem / den);
    var frac = rem - whole * den;
    var fracText = '';
    if (frac) { var g = gcd(frac, den); fracText = (frac / g) + '/' + (den / g); }
    var inText = whole ? String(whole) + (fracText ? ' ' + fracText : '') : (fracText || '0');
    var sign = inches < 0 && units ? '-' : '';
    return sign + (feet ? feet + '\'-' + inText + '"' : inText + '"');
  };

  // Graphic scale: whole increments only (1", 2", 3", 6", then feet). The bar's on-screen length is the real length
  // it stands for at this zoom (zoom = screen pixels per sheet inch), so its right edge moves as you zoom.
  SK.SCALE_BAR_STEPS = [1, 2, 3, 6, 12, 24, 48, 96, 192, 384, 768, 1536];   // inches: 1", 2", 3", 6", 12", then 2', 4', 8' …
  // The bar's end label, with unit marks: inches as 12", feet as 8' (up to 12 inches in inches, then feet).
  SK.formatScaleLabel = function (inches) {
    if (inches <= 12) return inches + '"';
    return (inches / 12) + "'";
  };
  SK.scaleBarChoice = function (zoom, targetPx) {
    if (!(zoom > 0)) return null;
    var best = null;
    SK.SCALE_BAR_STEPS.forEach(function (inches) {
      var px = inches * zoom;
      var d = Math.abs(Math.log(px / targetPx));
      if (!best || d < best.d) best = { inches: inches, px: px, d: d };
    });
    return { inches: best.inches, px: best.px, label: SK.formatScaleLabel(best.inches) };
  };

  // Pen colours. 'ink' is black on light backgrounds and turns white on dark ones.
  SK.PENS = { yellow: '#e8b400', red: '#d1342b', blue: '#2456c7', green: '#1f8a4c' };

  // Line weights on paper, in inches. Real width = paper width × scale factor.
  SK.WEIGHTS = { w1: 0.01, w2: 0.02, w3: 0.035, w4: 0.06 };

  // Relative luminance of a #rrggbb colour, 0 (black) to 1 (white).
  SK.luma = function (hex) {
    var n = parseInt(String(hex).replace('#', ''), 16);
    var lin = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    var r = lin((n >> 16) & 255), g = lin((n >> 8) & 255), b = lin(n & 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  // The colour an item is drawn in on a given background.
  SK.inkFor = function (key, bg) {
    if (!key || key === 'ink') return SK.luma(bg) < 0.3 ? '#f4f4f2' : '#111111';
    return SK.PENS[key] || '#111111';
  };

  // The grid follows the scale, which is the printed sheet. A minor square is one printed inch, and the sheet is in
  // real inches, so a square is factor real inches (at 3" = 1'-0", factor 4). Every fifth line is a major line, so the
  // major grid prints at 5" x 5" at any scale. It is painted on screen only and is left out of every export.
  SK.gridStep = function (factor) { return factor; };
  SK.GRID_MAJOR = 5;

  // Grid colours are shades of the background, never a hue of their own. "Percent white" is the brightest channel.
  // Minor lines sit 10 points away from the background and major lines 25 points away: darker on a light
  // background (80% white gives 70% and 55%), lighter on a dark one so the grid still shows.
  SK.gridShades = function (bg) {
    var n = parseInt(String(bg).replace('#', ''), 16);
    var rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    var v = Math.max(rgb[0], rgb[1], rgb[2]) / 255;
    var darker = v >= 0.5;
    function shade(d) {
      var t = Math.min(1, Math.max(0, v + (darker ? -d : d)));
      return 'rgb(' + rgb.map(function (c) {
        return Math.round(darker ? c * (t / v) : c + (255 - c) * ((t - v) / (1 - v)));
      }).join(',') + ')';
    }
    return { minor: shade(0.10), major: shade(0.25) };
  };

  SK.formatAngle = function (deg) {
    var r = Math.round(deg * 2) / 2;
    return (r % 1 ? r.toFixed(1) : String(r)) + '°';
  };

  root.SK = SK;
  if (typeof module !== 'undefined' && module.exports) module.exports = SK;
})(typeof window !== 'undefined' ? window : globalThis);
