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

  SK.formatAngle = function (deg) {
    var r = Math.round(deg * 2) / 2;
    return (r % 1 ? r.toFixed(1) : String(r)) + '°';
  };

  root.SK = SK;
  if (typeof module !== 'undefined' && module.exports) module.exports = SK;
})(typeof window !== 'undefined' ? window : globalThis);
