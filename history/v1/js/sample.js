// Quick Detail — bundled sample: parapet at a low-slope roof (inches, 3in = 1ft).
// Kept as a script, not a .json fetch, so the editor works straight from the file system.
(function (QD) {
  'use strict';

  function arch(text, extra) {
    var o = { text: text, source: 'architect', confidence: 'confirmed' };
    for (var k in extra) o[k] = extra[k];
    return o;
  }
  function mean(material, role) { return { material: material, role: role, source: 'architect', confidence: 'confirmed' }; }
  function rect(x0, y0, x1, y1) { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }
  function note(id, at, text) { return { id: id, geometry: { type: 'text', at: at }, graphics: { pen: 'P1', text: text } }; }
  function leader(id, pts) { return { id: id, geometry: { type: 'leader', points: pts }, graphics: { pen: 'P1', arrow: 'arrow' } }; }
  function ann(i, l, to, n) { return { id: 'rel' + i, type: 'annotates', from: l, to: to, note: n, source: 'architect' }; }

  QD.sampleDetail = function () {
    return {
      schema: QD.SCHEMA,
      id: 'parapet-membrane-01',
      title: 'Parapet at Low-Slope Roof',
      units: 'in',
      scale: '3in = 1ft',
      status: 'draft',
      created: '2026-10-23T00:00:00.000Z',
      modified: '2026-10-23T00:00:00.000Z',
      tags: ['parapet', 'roof', 'low-slope', 'coping'],
      derivedFrom: null,
      elements: [
        { id: 'e1', geometry: { type: 'region', points: rect(0, 0, 24, 6) }, graphics: { pen: 'P4', hatch: 'concrete' }, meaning: mean('concrete', 'structure') },
        { id: 'e2', geometry: { type: 'region', points: rect(24, -18, 32, 28.5) }, graphics: { pen: 'P4', hatch: 'masonry' }, meaning: mean('concrete_masonry', 'structure') },
        { id: 'e3', geometry: { type: 'region', points: rect(0, 6, 23.5, 10) }, graphics: { pen: 'P2', hatch: 'rigid_insulation' }, meaning: mean('rigid_insulation', 'thermal_layer') },
        {
          id: 'e4',
          geometry: { type: 'polyline', points: [[0, 10.25], [23.75, 10.25], [23.75, 30.25], [32.25, 30.25], [32.25, 27]] },
          graphics: { pen: 'P5', linetype: 'continuous' },
          meaning: mean('roofing_membrane', 'primary_water_barrier'),
          intent: [arch('Membrane turns up the parapet a minimum of 8 in above the roof surface.')],
          logic: [
            arch('Must be continuous from the field of the roof, over the parapet, to under the coping.'),
            { text: 'Likely needs a cant or reinforcing strip at the inside corner.', source: 'ai_inferred', confidence: 'medium' }
          ]
        },
        { id: 'e5', geometry: { type: 'region', points: rect(24, 28.5, 32, 30) }, graphics: { pen: 'P3', hatch: 'wood_blocking' }, meaning: mean('wood_blocking', 'attachment') },
        {
          id: 'e6',
          geometry: { type: 'polyline', points: [[23.25, 26.5], [22.75, 27], [22.75, 31], [33.25, 31], [33.25, 27], [33.75, 26.5]] },
          graphics: { pen: 'P3' },
          meaning: mean('metal_coping', 'primary_water_barrier'),
          logic: [arch('Coping slopes to the roof side and laps over the membrane on both faces.')]
        },
        { id: 'e7', geometry: { type: 'breakline', points: [[0, -1], [0, 11.5]] }, graphics: { pen: 'P2' } },
        { id: 'e8', geometry: { type: 'breakline', points: [[23, -18], [33, -18]] }, graphics: { pen: 'P2' } },
        note('n1', [38, 33.5], 'PREFINISHED METAL COPING'),
        leader('l1', [[37.6, 33.65], [36, 33.65], [33.25, 29.5]]),
        note('n2', [38, 25], '2x WOOD BLOCKING'),
        leader('l2', [[37.6, 25.15], [36, 25.15], [31, 29.2]]),
        note('n3', [38, 12], '8" CMU PARAPET'),
        leader('l3', [[37.6, 12.15], [36, 12.15], [32, 8]]),
        note('n4', [1, 25], 'ROOFING MEMBRANE, TURN UP\nAND OVER PARAPET UNDER COPING'),
        leader('l4', [[11.2, 25.15], [15, 25.15], [23.75, 21]]),
        note('n5', [1, 16], 'RIGID INSULATION'),
        leader('l5', [[7.4, 16.15], [9, 16.15], [12, 8]]),
        note('n6', [1, -4], 'CONCRETE ROOF DECK'),
        leader('l6', [[8.1, -3.85], [9.5, -3.85], [12, 3]]),
        { id: 'd1', geometry: { type: 'dimension', points: [[23.75, 10.25], [23.75, 30.25]], offset: 4 }, graphics: { pen: 'P1' } },
        { id: 'd2', geometry: { type: 'dimension', points: [[22.75, 31], [33.25, 31]], offset: 3 }, graphics: { pen: 'P1' } }
      ],
      relationships: [
        ann(1, 'l1', 'e6', 'n1'),
        ann(2, 'l2', 'e5', 'n2'),
        ann(3, 'l3', 'e2', 'n3'),
        ann(4, 'l4', 'e4', 'n4'),
        ann(5, 'l5', 'e3', 'n5'),
        ann(6, 'l6', 'e1', 'n6'),
        { id: 'rel7', type: 'laps_over', from: 'e6', to: 'e4', source: 'architect' },
        { id: 'rel8', type: 'fastened_to', from: 'e5', to: 'e2', source: 'architect' },
        { id: 'rel9', type: 'bears_on', from: 'e3', to: 'e1', source: 'architect' }
      ],
      review: [
        {
          id: 'r1',
          check: 'attachment',
          subject: 'e6',
          result: 'open_question',
          state: 'open',
          text: 'No continuous cleat is shown at the exterior face of the coping. Confirm how the coping is held down.',
          source: 'ai_inferred',
          confidence: 'medium'
        }
      ]
    };
  };
})(globalThis.QD = globalThis.QD || {});
