// Quick Detail — GIFs of one scene, and of a line of scenes from the main line to a branch. Frames are drawn with the
// same paint as the sheet and encoded by sketch/gif.js. The caller passes what the drawing needs (env), so the log and
// the viewer share this. Browser only: it draws to canvases.
(function (root) {
  'use strict';

  var SK = root.SK || {};

  SK.GIF_W = 640;
  SK.GIF_H = 420;
  SK.GIF_MAX_FRAMES = 60;      // a long line is sampled down to this many frames, always ending on the last scene
  var CARD_FRAMES = 20;        // a scene GIF is its drawing animated over this many frames
  var CARD_MS = 120;           // the pace of a scene's animation
  var LINE_MS = 400;           // the pace of a line of scenes, as in the log's flip
  var HOLD = 3;                // the last frame is repeated so the end stays on screen

  // env: { visible(items), ac(scale), ink, paper } from whichever page is drawing.

  // One frame: the items fitted to bounds b.
  function frameOf(items, b, env, scale) {
    var cv = document.createElement('canvas');
    cv.width = SK.GIF_W;
    cv.height = SK.GIF_H;
    var g = cv.getContext('2d');
    var v = SK.fitView(b, cv.width, cv.height, 24) || { x: 0, y: 0, z: 1 };
    SK.paint(g, env.visible(items), v, { ac: env.ac(scale), ink: env.ink, paper: env.paper, bg: env.paper, w: cv.width, h: cv.height });
    var px = g.getImageData(0, 0, cv.width, cv.height);
    return { width: cv.width, height: cv.height, data: px.data };
  }

  // The bounds of several bounds together, so every frame of a GIF is framed the same.
  function union(a, b) {
    if (!a) return b;
    if (!b) return a;
    return { minx: Math.min(a.minx, b.minx), miny: Math.min(a.miny, b.miny), maxx: Math.max(a.maxx, b.maxx), maxy: Math.max(a.maxy, b.maxy) };
  }

  // The drawing of a scene at time T, and its bounds.
  function stateOf(s, T, env) {
    var items = SK.stateAt(s, T);
    return { items: items, b: SK.itemsBounds(env.visible(items), env.ac(s.scale)) };
  }

  // A GIF of one scene: its drawing animated from its start to its end.
  SK.sceneGif = function (s, m, env) {
    var span = Math.max(1, m.end - m.start);
    var end = stateOf(s, m.end, env);
    var frames = [];
    for (var i = 1; i <= CARD_FRAMES; i++) {
      frames.push(frameOf(SK.stateAt(s, m.start + span * i / CARD_FRAMES), end.b, env, s.scale));
    }
    for (var h = 0; h < HOLD; h++) frames.push(frames[frames.length - 1]);
    return SK.encodeGif(frames, CARD_MS);
  };

  // A GIF of a line of scenes: steps is [{ s, m }] in order. One frame per scene, at the end of that scene.
  SK.lineGif = function (steps, env) {
    if (!steps.length) throw new Error('No scenes to make a GIF from.');
    var picks = [];
    var n = steps.length;
    var count = Math.min(n, SK.GIF_MAX_FRAMES);
    for (var i = 0; i < count; i++) picks.push(steps[Math.round((i + 1) * n / count) - 1]);
    var states = picks.map(function (st) { return { s: st.s, st: stateOf(st.s, st.m.end, env) }; });
    var b = null;
    states.forEach(function (x) { b = union(b, x.st.b); });
    var frames = states.map(function (x) { return frameOf(x.st.items, b, env, x.s.scale); });
    for (var h = 0; h < HOLD; h++) frames.push(frames[frames.length - 1]);
    return SK.encodeGif(frames, LINE_MS);
  };

  root.SK = SK;
})(window);
