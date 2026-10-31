// Quick Detail — lanes: the branch genealogy of a detail. A lane is the main line (0) or a branch of it.
// A branch records its fork: { step } is the number of the scene in its parent lane that it branched from.
// Labels are computed from the tree, never stored, so they stay right after a branch is deleted.
// Pure: runs in the page and in Node tests.
(function (root) {
  'use strict';

  var SK = root.SK || {};

  SK.LANE_SCHEMA = 'quick-detail/lanes-1';

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

  // Address of every lane in one family.
  // lanes: [{ id, parentId, fork: { step } | null, created }]. The main line has no parentId and is labelled "0".
  // A branch is its parent's address and its fork step: "4", "4B" (second branch off step 4), "4B.6" (branch off
  // step 6 of 4B), "4B.6B", and so on. A branch off the main line drops the "0.". Returns { [id]: label }.
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
          labels[l.id] = parentLabel ? parentLabel + '.' + own : own;
          place(labels[l.id], kids[l.id] || []);
        });
      });
    }

    lanes.forEach(function (l) {
      if (!l.parentId || !byId[l.parentId]) {
        labels[l.id] = '0';
        place('', kids[l.id] || []);
      }
    });
    return labels;
  };

  // A version of a lane's card: v1 is the first save, and each later save of a genealogical edit adds one.
  SK.versionLabel = function (n) { return 'v' + (n > 0 ? Math.floor(n) : 1); };

  root.SK = SK;
  if (typeof module !== 'undefined' && module.exports) module.exports = SK;
})(typeof window !== 'undefined' ? window : globalThis);
