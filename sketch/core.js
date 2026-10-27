// Sketch — pure logic for recordings: replay of the drawing at any moment, and splitting a recording into moments.
// No DOM here, so the same file runs in the page and in Node tests.
(function (root) {
  'use strict';

  var SK = {};

  // Quiet time that closes one moment and opens the next.
  SK.IDLE_MS = 3000;

  // A stroke: { id, t0, pts: [[x, y, pressure, dt], ...] }.
  // x and y are fractions of the sheet width, so drawings scale with the window.
  // t0 is milliseconds from the start of the recording; dt is milliseconds from t0.

  SK.strokeEnd = function (s) {
    return s.pts.length ? s.t0 + s.pts[s.pts.length - 1][3] : s.t0;
  };

  // Apply one recorded event to a sheet (an array of strokes). Changes the array and returns it.
  // Events: { t, type: 'add', stroke } | { t, type: 'undo', id } | { t, type: 'clear' }
  SK.apply = function (sheet, ev) {
    if (ev.type === 'add') {
      sheet.push(ev.stroke);
    } else if (ev.type === 'undo') {
      for (var i = sheet.length - 1; i >= 0; i--) {
        if (sheet[i].id === ev.id) { sheet.splice(i, 1); break; }
      }
    } else if (ev.type === 'clear') {
      sheet.length = 0;
    }
    return sheet;
  };

  // A stroke cut to what had been drawn by time T. Finished strokes come back as they are.
  function cut(stroke, T) {
    if (SK.strokeEnd(stroke) <= T) return stroke;
    return {
      id: stroke.id,
      t0: stroke.t0,
      pts: stroke.pts.filter(function (p) { return stroke.t0 + p[3] <= T; })
    };
  }

  // The drawing as it looked T milliseconds into a recording: the base sheet, then every event up to T.
  SK.stateAt = function (session, T) {
    var sheet = session.base.slice();
    session.events.forEach(function (ev) {
      if (ev.t > T) return;
      if (ev.type === 'add') sheet.push(cut(ev.stroke, T));
      else SK.apply(sheet, ev);
    });
    return sheet.filter(function (s) { return s.pts.length > 0; });
  };

  // Split a recording into moments: runs of activity (pen, undo, clear or speech) with no quiet gap of IDLE_MS or more.
  // Each moment: { id, start, end, strokeIds, text }. Times are milliseconds from the start of the recording.
  SK.segment = function (session) {
    var spans = [];
    session.events.forEach(function (ev) {
      if (ev.type === 'add') spans.push({ start: ev.stroke.t0, end: SK.strokeEnd(ev.stroke), stroke: ev.stroke.id });
      else spans.push({ start: ev.t, end: ev.t });
    });
    (session.speech || []).forEach(function (sp) {
      spans.push({ start: sp.t, end: sp.t, text: sp.text });
    });
    spans.sort(function (a, b) { return a.start - b.start; });

    var moments = [];
    var cur = null;
    spans.forEach(function (sp) {
      if (!cur || sp.start - cur.end >= SK.IDLE_MS) {
        cur = { id: 'm' + (moments.length + 1), start: sp.start, end: sp.end, strokeIds: [], text: [] };
        moments.push(cur);
      }
      cur.end = Math.max(cur.end, sp.end);
      if (sp.stroke) cur.strokeIds.push(sp.stroke);
      if (sp.text) cur.text.push(sp.text);
    });
    moments.forEach(function (m) { m.text = m.text.join(' '); });
    return moments;
  };

  SK.formatTime = function (ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return pad(Math.floor(s / 60)) + ':' + pad(s % 60);
  };

  SK.defaultTitle = function (date) {
    return 'Recording ' + date.toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SK;
  else root.SK = SK;
})(typeof window !== 'undefined' ? window : globalThis);
