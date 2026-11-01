// Quick Detail — lanes: the branch genealogy of a detail. A lane is the main line (0) or a branch of it.
// A branch records its fork: { step } is the number of the scene in its parent lane that it branched from.
// Labels are computed from the tree, never stored, so they stay right after a branch is deleted.
// Pure: runs in the page and in Node tests.
(function (root) {
  'use strict';

  var SK = root.SK || {};

  // The steps of one lane: every scene of its recordings, in recording order, numbered from 1 across all of them.
  // sessions: the recordings as stored ({ id, events, speech, voice }).
  SK.laneSteps = function (sessions) {
    var out = [];
    (sessions || []).forEach(function (s) {
      SK.segment(s).forEach(function (m) {
        out.push({ n: out.length + 1, sessionId: s.id, start: m.start, end: m.end, text: m.text, ids: m.ids, marked: m.marked });
      });
    });
    return out;
  };

  // Sibling letters: the first branch off a step has no letter, the next ones take B, C, ... in creation order.
  function letter(i) { return i === 0 ? '' : String.fromCharCode(65 + i); }

  // Address of every lane in one family. Read as a path from the main line: 0 is the main line, 0.3 is a branch off
  // its scene 3, 0.3.2 is a branch off scene 2 of 0.3, and a second branch off the same scene takes a letter: 0.3B.
  // lanes: [{ id, parentId, fork: { step } | null, created }]. The main line has no parentId and is labelled "0".
  // A branch is its parent's address and its fork step, so every address starts "0.". Returns { [id]: label }.
  SK.laneLabels = function (lanes) {
    var byId = {};
    lanes.forEach(function (l) { byId[l.id] = l; });
    var kids = {};
    lanes.forEach(function (l) {
      if (l.parentId && byId[l.parentId]) (kids[l.parentId] = kids[l.parentId] || []).push(l);
    });
    var labels = {};

    function place(parentLabel, list) {
      var byStep = {};
      var steps = [];
      list.slice().sort(function (a, b) { return (a.created || 0) - (b.created || 0); }).forEach(function (l) {
        var step = l.fork && l.fork.step != null ? String(l.fork.step) : '?';
        if (!byStep[step]) { byStep[step] = []; steps.push(step); }
        byStep[step].push(l);
      });
      steps.forEach(function (step) {
        byStep[step].forEach(function (l, i) {
          var own = step + letter(i);
          // A branch of a lane with no recorded fork cannot be placed, so it reads "?".
          labels[l.id] = step === '?' ? '?' : parentLabel + '.' + own;
          place(labels[l.id], kids[l.id] || []);
        });
      });
    }

    lanes.forEach(function (l) {
      if (!l.parentId || !byId[l.parentId]) {
        labels[l.id] = '0';
        place('0', kids[l.id] || []);
      }
    });
    return labels;
  };

  // The tree a detail belongs to: its main line (the root) and every branch below it, root first.
  // details: every detail on the device. Returns [] if id is not one of them.
  SK.familyOf = function (details, id) {
    var byId = {};
    details.forEach(function (d) { byId[d.id] = d; });
    if (!byId[id]) return [];
    var root = byId[id], guard = 0;
    while (root.parentId && byId[root.parentId] && guard++ < 1000) root = byId[root.parentId];
    var out = [root], seen = {};
    seen[root.id] = true;
    for (var i = 0; i < out.length; i++) {
      details.forEach(function (d) {
        if (d.parentId === out[i].id && !seen[d.id]) { seen[d.id] = true; out.push(d); }
      });
    }
    return out;
  };

  // Lane ids in reading order: the main line, then each branch straight after the lane it forks from,
  // siblings by the step they fork from and then by creation. This is the order the log stacks its tracks.
  SK.laneOrder = function (lanes) {
    var byId = {}, kids = {}, out = [], seen = {};
    lanes.forEach(function (l) { byId[l.id] = l; });
    lanes.forEach(function (l) {
      if (l.parentId && byId[l.parentId]) (kids[l.parentId] = kids[l.parentId] || []).push(l);
    });
    function stepOf(l) { return l.fork && l.fork.step != null ? l.fork.step : Infinity; }
    function walk(l) {
      if (seen[l.id]) return;
      seen[l.id] = true;
      out.push(l.id);
      (kids[l.id] || []).slice().sort(function (a, b) {
        return stepOf(a) - stepOf(b) || (a.created || 0) - (b.created || 0);
      }).forEach(walk);
    }
    lanes.forEach(function (l) { if (!l.parentId || !byId[l.parentId]) walk(l); });
    return out;
  };

  // The column of each lane's fork on one shared time axis, where a scene's column is its lane's offset plus its step
  // minus one. The main line is 0. A branch is its parent's offset plus the step it forked from, so a branch of a branch
  // sits at the scene count along the whole line. Returns { [id]: offset }.
  SK.laneOffsets = function (lanes) {
    var byId = {}, out = {};
    lanes.forEach(function (l) { byId[l.id] = l; });
    SK.laneOrder(lanes).forEach(function (id) {
      var l = byId[id];
      var hasParent = !!(l.parentId && byId[l.parentId]);
      var base = hasParent ? out[l.parentId] : 0;
      var step = hasParent && l.fork && l.fork.step != null ? l.fork.step : 0;
      out[id] = base + step;
    });
    return out;
  };

  // The key that ties a note to its scene: the recording and the scene's start. Stable while other scenes are removed.
  SK.sceneKey = function (sessionId, start) { return sessionId + ':' + Math.round(start); };

  // A recording with one scene taken out: its events, speech and voice spans that begin inside the scene, and the
  // notes on it. Times of everything else stay as they were, so the scenes after it keep their starts and notes.
  // Returns a new record; the one passed in is not changed.
  SK.removeScene = function (s, m) {
    var key = SK.sceneKey(s.id, m.start);
    function inside(t) { return t >= m.start && t <= m.end; }
    var out = Object.assign({}, s);
    delete out._scenes;
    out.events = (s.events || []).filter(function (ev) {
      return !inside(ev.type === 'put' && ev.anim ? ev.item.t0 : ev.t);
    });
    out.speech = (s.speech || []).filter(function (sp) { return !inside(sp.t); });
    out.voice = (s.voice || []).filter(function (v) { return !inside(v[0]); });
    out.notes = (s.notes || []).filter(function (n) { return n.key !== key; });
    return out;
  };

  // The fork changes that follow from taking step n out of a lane. A branch that forked after step n is promoted to
  // fork from the step before it; a branch after a later step moves up by one, since the steps after n renumber.
  // Returns [{ id, fork }] for the branches that change.
  SK.stepDeleteUpdates = function (details, laneId, n) {
    var out = [];
    details.forEach(function (d) {
      if (d.parentId !== laneId || !d.fork || d.fork.step == null) return;
      var step = d.fork.step;
      var next = step >= n ? step - 1 : step;
      if (next !== step) out.push({ id: d.id, fork: { step: next } });
    });
    return out;
  };

  // The changes when a branch is deleted: its own branches are promoted to fork from where it forked from its parent.
  // The main line cannot be deleted this way. Returns [{ id, parentId, fork }] for each branch that moves.
  SK.promoteUpdates = function (details, id) {
    var lane = null;
    details.forEach(function (d) { if (d.id === id) lane = d; });
    if (!lane || !lane.parentId) return [];
    var out = [];
    details.forEach(function (d) {
      if (d.parentId !== id) return;
      out.push({ id: d.id, parentId: lane.parentId, fork: lane.fork ? { step: lane.fork.step } : null });
    });
    return out;
  };

  // A version of a lane's card: v1 is the first save, and each later save of a genealogical edit adds one.
  SK.versionLabel = function (n) { return 'v' + (n > 0 ? Math.floor(n) : 1); };

  root.SK = SK;
  if (typeof module !== 'undefined' && module.exports) module.exports = SK;
})(typeof window !== 'undefined' ? window : globalThis);
