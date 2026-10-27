// Sketch v3 — pure logic for recordings: replay of the sheet at any moment, and splitting a recording into scenes.
// No DOM here, so the same file runs in the page and in Node tests.
(function (root) {
  'use strict';

  var SK = root.SK || {};

  // Quiet time that closes one scene and opens the next.
  SK.IDLE_MS = 3000;

  // Sheet items all carry { id, kind }. kind is 'stroke', 'note' or 'dim'.
  // A stroke: { id, kind: 'stroke', t0, w, pts: [[x, y, pressure, dt], ...] }
  // x and y are world inches (real size). t0 is ms from the start of the recording; dt is ms from t0.
  //
  // Recording events:
  //   { t, type: 'put', item, anim }   add or replace an item; anim = drawn live, so replay draws it point by point
  //   { t, type: 'del', id }           remove an item
  //   { t, type: 'replace', items }    the whole sheet swapped (clear, restore, undo of a restore)
  //   { t, type: 'mark' }              a scene break asked for by the scene button

  SK.strokeEnd = function (s) {
    return s.pts.length ? s.t0 + s.pts[s.pts.length - 1][3] : s.t0;
  };

  // Apply one event to a sheet (an array of items). Returns the sheet (a new array for 'replace').
  SK.apply = function (items, ev) {
    if (ev.type === 'put') {
      for (var i = 0; i < items.length; i++) {
        if (items[i].id === ev.item.id) { items[i] = ev.item; return items; }
      }
      items.push(ev.item);
    } else if (ev.type === 'del') {
      for (var j = items.length - 1; j >= 0; j--) {
        if (items[j].id === ev.id) { items.splice(j, 1); break; }
      }
    } else if (ev.type === 'replace') {
      return ev.items.slice();
    }
    return items;
  };

  // A live-drawn stroke cut to what had been drawn by time T. Finished strokes come back as they are.
  function cut(stroke, T) {
    if (SK.strokeEnd(stroke) <= T) return stroke;
    var out = {};
    for (var k in stroke) out[k] = stroke[k];
    out.pts = stroke.pts.filter(function (p) { return stroke.t0 + p[3] <= T; });
    return out;
  }

  // The sheet as it looked T ms into a recording: the base items, then every event up to T.
  SK.stateAt = function (session, T) {
    var items = session.base.slice();
    session.events.forEach(function (ev) {
      if (ev.t > T) return;
      if (ev.type === 'put' && ev.anim) items = SK.apply(items, { type: 'put', item: cut(ev.item, T) });
      else items = SK.apply(items, ev);
    });
    return items.filter(function (it) { return it.kind !== 'stroke' || it.pts.length > 0; });
  };

  // Every activity span in a recording, sorted by start.
  function spans(session) {
    var out = [];
    session.events.forEach(function (ev) {
      if (ev.type === 'mark') out.push({ start: ev.t, end: ev.t, mark: true });
      else if (ev.type === 'put' && ev.anim) out.push({ start: ev.item.t0, end: SK.strokeEnd(ev.item), id: ev.item.id });
      else if (ev.type === 'put') out.push({ start: ev.t, end: ev.t, id: ev.item.id });
      else out.push({ start: ev.t, end: ev.t });
    });
    (session.speech || []).forEach(function (sp) { out.push({ start: sp.t, end: sp.t, text: sp.text }); });
    (session.voice || []).forEach(function (v) { out.push({ start: v[0], end: v[1] }); });
    out.sort(function (a, b) { return a.start - b.start || (b.mark ? 1 : 0) - (a.mark ? 1 : 0); });
    return out;
  }

  // Split a recording into scenes: runs of activity (pen, edits, voice, speech) with no quiet gap of IDLE_MS or more.
  // A mark from the scene button always starts a new scene, even mid-sentence.
  // Each scene: { id, start, end, ids, text, marked }. Times are ms from the start of the recording.
  SK.segment = function (session) {
    var scenes = [];
    var cur = null;
    spans(session).forEach(function (sp) {
      if (!cur || sp.mark || sp.start - cur.end >= SK.IDLE_MS) {
        cur = { id: 'm' + (scenes.length + 1), start: sp.start, end: sp.end, ids: [], text: [], marked: !!sp.mark };
        scenes.push(cur);
      }
      cur.end = Math.max(cur.end, sp.end);
      if (sp.id && cur.ids.indexOf(sp.id) < 0) cur.ids.push(sp.id);
      if (sp.text) cur.text.push(sp.text);
    });
    scenes.forEach(function (m) { m.text = m.text.join(' '); });
    return scenes;
  };

  SK.firstWords = function (text, n) {
    var words = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (words.length <= n) return words.join(' ');
    return words.slice(0, n).join(' ') + '…';
  };

  SK.formatTime = function (ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return pad(Math.floor(s / 60)) + ':' + pad(s % 60);
  };

  root.SK = SK;
  if (typeof module !== 'undefined' && module.exports) module.exports = SK;
})(typeof window !== 'undefined' ? window : globalThis);
