// Quick Detail — the neutral detail file: creation, ids, validation, and element point access.
(function (QD) {
  'use strict';

  var M = {};

  M.GEOMETRY_TYPES = ['line', 'polyline', 'region', 'circle', 'arc', 'text', 'leader', 'dimension', 'breakline'];

  M.newDetail = function (title) {
    return {
      schema: QD.SCHEMA,
      id: 'detail-' + Date.now().toString(36),
      title: title || 'Untitled Detail',
      units: 'in',
      scale: '3in = 1ft',
      status: 'draft',
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      tags: [],
      derivedFrom: null,
      elements: [],
      relationships: [],
      review: []
    };
  };

  M.clone = function (o) { return JSON.parse(JSON.stringify(o)); };

  // Next free id with a given prefix (e = element, n = note, l = leader, d = dimension, rel, r = review).
  M.nextId = function (detail, prefix) {
    var used = {};
    detail.elements.forEach(function (e) { used[e.id] = true; });
    detail.relationships.forEach(function (r) { if (r.id) used[r.id] = true; });
    detail.review.forEach(function (r) { used[r.id] = true; });
    var i = 1;
    while (used[prefix + i]) i++;
    return prefix + i;
  };

  M.byId = function (detail, id) { return detail.elements.find(function (e) { return e.id === id; }) || null; };

  // Every editable point of an element's geometry, as live references.
  M.points = function (el) {
    var g = el.geometry;
    if (g.points) return g.points;
    if (g.type === 'circle' || g.type === 'arc') return [g.center];
    if (g.type === 'text') return [g.at];
    return [];
  };

  M.translate = function (el, dx, dy) {
    M.points(el).forEach(function (p) { p[0] += dx; p[1] += dy; });
  };

  // Default meaning for a newly drawn element, from the material picker.
  M.meaningFor = function (materialId) {
    if (!materialId) return null;
    var m = QD.materialById(materialId);
    return {
      material: materialId,
      role: m ? m.role : null,
      source: 'architect',
      confidence: 'confirmed'
    };
  };

  M.isAnnotation = function (el) {
    var t = el.geometry.type;
    return t === 'text' || t === 'leader' || t === 'dimension' || t === 'breakline';
  };

  M.label = function (el) {
    if (!el) return '(missing)';
    var t = el.geometry.type;
    if (t === 'text') return el.id + ' · note "' + String(el.graphics.text || '').split('\n')[0].slice(0, 28) + '"';
    var mat = el.meaning && el.meaning.material;
    var ml = mat ? (QD.materialById(mat) ? QD.materialById(mat).label : QD.humanize(mat)) : '';
    return el.id + ' · ' + t + (ml ? ' · ' + ml : '');
  };

  // Structural validation. Returns a list of problems; empty list means the file is usable.
  M.validate = function (d) {
    var errs = [];
    if (!d || typeof d !== 'object') return ['File is not a JSON object.'];
    if (typeof d.schema !== 'string' || d.schema.indexOf('quickdetail.detail/') !== 0) errs.push('Missing or unknown "schema".');
    if (d.units !== 'in' && d.units !== 'mm') errs.push('"units" must be "in" or "mm".');
    if (!Array.isArray(d.elements)) { errs.push('"elements" must be a list.'); return errs; }
    var ids = {};
    function isPt(p) { return Array.isArray(p) && p.length === 2 && isFinite(p[0]) && isFinite(p[1]); }
    d.elements.forEach(function (e, i) {
      var where = 'Element ' + (e && e.id ? e.id : '#' + i);
      if (!e || !e.id) { errs.push(where + ': missing id.'); return; }
      if (ids[e.id]) errs.push(where + ': duplicate id.');
      ids[e.id] = true;
      var g = e.geometry;
      if (!g || M.GEOMETRY_TYPES.indexOf(g.type) < 0) { errs.push(where + ': unknown geometry type.'); return; }
      if (!e.graphics || !QD.PENS.some(function (p) { return p.id === e.graphics.pen; })) errs.push(where + ': unknown pen.');
      if (g.points && !g.points.every(isPt)) errs.push(where + ': bad point coordinates.');
      var need = { line: 2, polyline: 2, region: 3, leader: 2, dimension: 2, breakline: 2 }[g.type];
      if (need && (!g.points || g.points.length < need)) errs.push(where + ': needs at least ' + need + ' points.');
      if ((g.type === 'circle' || g.type === 'arc') && (!isPt(g.center) || !(g.radius > 0))) errs.push(where + ': needs a center and a positive radius.');
      if (g.type === 'text' && !isPt(g.at)) errs.push(where + ': text needs an "at" point.');
    });
    (d.relationships || []).forEach(function (r, i) {
      var where = 'Relationship #' + (i + 1);
      if (!QD.RELATIONSHIPS.some(function (t) { return t.id === r.type; })) errs.push(where + ': unknown type "' + r.type + '".');
      if (!ids[r.from]) errs.push(where + ': "from" points to a missing element (' + r.from + ').');
      if (!ids[r.to]) errs.push(where + ': "to" points to a missing element (' + r.to + ').');
      if (r.note && !ids[r.note]) errs.push(where + ': "note" points to a missing element (' + r.note + ').');
    });
    return errs;
  };

  // Fill optional fields so older or hand-written files open cleanly.
  M.normalize = function (d) {
    d.relationships = d.relationships || [];
    d.review = d.review || [];
    d.tags = d.tags || [];
    d.status = d.status || 'draft';
    d.scale = d.scale || '3in = 1ft';
    d.title = d.title || 'Untitled Detail';
    d.elements.forEach(function (e) {
      e.graphics = e.graphics || { pen: 'P3' };
      e.graphics.pen = e.graphics.pen || 'P3';
      e.intent = e.intent || [];
      e.logic = e.logic || [];
    });
    return d;
  };

  QD.M = M;
})(globalThis.QD = globalThis.QD || {});
