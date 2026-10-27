// Quick Detail — first rule checks for the critical review engine.
// Each finding: { check, subject, result, text }. result is verified_requirement | likely_issue | open_question.
(function (QD) {
  'use strict';

  var M = QD.M;
  var R = {};

  var BARRIER_ROLES = ['primary_water_barrier', 'secondary_water_barrier', 'air_barrier', 'vapor_control'];

  function matLabel(el) {
    var id = el.meaning && el.meaning.material;
    var m = id && QD.materialById(id);
    return m ? m.label : QD.humanize(id || el.geometry.type);
  }

  R.run = function (d) {
    var out = [];
    var rels = d.relationships || [];
    var annotated = {};
    var leaderLinked = {};
    rels.forEach(function (r) {
      if (r.type === 'annotates') { annotated[r.to] = true; leaderLinked[r.from] = true; }
    });

    // Broken references come first: everything else depends on them.
    M.validate(d).forEach(function (msg) {
      out.push({ check: 'file_integrity', subject: null, result: 'likely_issue', text: msg });
    });

    d.elements.forEach(function (el) {
      var t = el.geometry.type;
      if (t === 'leader' && !leaderLinked[el.id]) {
        out.push({ check: 'annotation_target', subject: el.id, result: 'likely_issue',
          text: 'Leader ' + el.id + ' does not point at a recorded element. Redraw it with its tip on the line it describes, or add an "annotates" relationship.' });
      }
      if (M.isAnnotation(el)) return;
      if (el.meaning && el.meaning.material && !annotated[el.id]) {
        out.push({ check: 'annotation_coverage', subject: el.id, result: 'open_question',
          text: matLabel(el) + ' (' + el.id + ') has no note pointing to it.' });
      }
      if (el.meaning && BARRIER_ROLES.indexOf(el.meaning.role) >= 0) {
        var linked = rels.some(function (r) {
          return (r.from === el.id || r.to === el.id) && (r.type === 'terminates_at' || r.type === 'continuous_with' || r.type === 'laps_over' || r.type === 'laps_under');
        });
        if (!linked) {
          out.push({ check: 'barrier_continuity', subject: el.id, result: 'open_question',
            text: matLabel(el) + ' (' + el.id + ') acts as the ' + QD.humanize(el.meaning.role) + ', but no termination, lap, or continuity is recorded at its ends.' });
        }
      }
      function unconfirmed(item) { return item && item.source === 'ai_inferred' && item.confidence !== 'confirmed'; }
      if (unconfirmed(el.meaning)) {
        out.push({ check: 'unconfirmed_inference', subject: el.id, result: 'open_question',
          text: 'The meaning of ' + el.id + ' (' + matLabel(el) + ') was inferred and has not been confirmed.' });
      }
      (el.logic || []).concat(el.intent || []).forEach(function (item) {
        if (unconfirmed(item)) {
          out.push({ check: 'unconfirmed_inference', subject: el.id, result: 'open_question',
            text: 'Inferred note on ' + el.id + ' is unconfirmed: "' + item.text + '"' });
        }
      });
    });

    var untagged = d.elements.filter(function (el) { return !M.isAnnotation(el) && !(el.meaning && el.meaning.material); });
    if (untagged.length) {
      out.push({ check: 'meaning_coverage', subject: null, result: 'open_question',
        text: untagged.length + ' drawn element' + (untagged.length > 1 ? 's carry' : ' carries') + ' no meaning yet: ' + untagged.map(function (e) { return e.id; }).join(', ') + '.' });
    }
    return out;
  };

  QD.R = R;
})(globalThis.QD = globalThis.QD || {});
