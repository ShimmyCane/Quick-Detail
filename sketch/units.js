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

  // The grid is 1/4" on paper, so its real spacing changes with the scale. It never gets closer than 5 px on screen.
  SK.gridStep = function (factor) { return 0.25 * factor; };

  SK.formatAngle = function (deg) {
    var r = Math.round(deg * 2) / 2;
    return (r % 1 ? r.toFixed(1) : String(r)) + '°';
  };

  root.SK = SK;
  if (typeof module !== 'undefined' && module.exports) module.exports = SK;
})(typeof window !== 'undefined' ? window : globalThis);
