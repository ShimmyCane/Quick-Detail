// Quick Detail — shared vocabulary: pens, scales, hatches, materials, roles, relationships.
// Loaded first. Everything attaches to the global QD namespace (browser or Node).
(function (QD) {
  'use strict';

  QD.SCHEMA = 'quickdetail.detail/0.2';

  // Five black pens and one gray screen. Widths are paper millimeters (settings can override).
  QD.PENS = [
    { id: 'P1', name: 'Extra fine', mm: 0.13, gray: 0, dxfColor: 1, use: 'Hatch, dimensions, leaders' },
    { id: 'P2', name: 'Fine', mm: 0.18, gray: 0, dxfColor: 2, use: 'Secondary edges, minor layers' },
    { id: 'P3', name: 'Medium', mm: 0.25, gray: 0, dxfColor: 3, use: 'Material edges in elevation' },
    { id: 'P4', name: 'Heavy', mm: 0.35, gray: 0, dxfColor: 4, use: 'Materials cut in section' },
    { id: 'P5', name: 'Extra heavy', mm: 0.5, gray: 0, dxfColor: 5, use: 'Primary cut profile, membranes' },
    { id: 'S1', name: 'Screen', mm: 0.25, gray: 0.55, dxfColor: 8, use: 'Existing, context, by others' }
  ];

  // Linetype dash patterns in paper millimeters.
  QD.LINETYPES = {
    continuous: null,
    dashed: [3, 1.5],
    hidden: [1.5, 1],
    center: [6, 1.5, 1.5, 1.5]
  };

  // Scale label -> ratio (paper length / real length).
  QD.SCALES = [
    { label: 'Full size', ratio: 1 },
    { label: 'Half full size', ratio: 0.5 },
    { label: '3in = 1ft', ratio: 0.25 },
    { label: '1-1/2in = 1ft', ratio: 0.125 },
    { label: '1in = 1ft', ratio: 1 / 12 },
    { label: '3/4in = 1ft', ratio: 1 / 16 },
    { label: '1:2', ratio: 0.5 },
    { label: '1:5', ratio: 0.2 },
    { label: '1:10', ratio: 0.1 },
    { label: '1:20', ratio: 0.05 }
  ];

  // Hatch patterns. Each family: angle (deg), spacing (paper mm). Extras handled in primitives.js.
  QD.HATCHES = {
    none: { label: 'None (outline only)', families: [] },
    solid_screen: { label: 'Solid screen (gray)', fill: 0.82, families: [] },
    solid_poche: { label: 'Solid poché (black)', fill: 0, families: [] },
    diag45: { label: 'Diagonal (generic cut)', families: [{ angle: 45, spacing: 1.5 }] },
    cross45: { label: 'Cross-hatch', families: [{ angle: 45, spacing: 1.5 }, { angle: 135, spacing: 1.5 }] },
    steel: { label: 'Steel (tight diagonal)', families: [{ angle: 45, spacing: 0.7 }] },
    concrete: { label: 'Concrete', families: [{ angle: 45, spacing: 3 }], dots: 4.5 },
    masonry: { label: 'Masonry / CMU', families: [{ angle: 45, spacing: 1.2 }] },
    rigid_insulation: { label: 'Rigid insulation', families: [{ angle: 45, spacing: 1.2 }, { angle: 135, spacing: 1.2 }] },
    batt_insulation_simple: { label: 'Batt insulation (simple)', families: [{ angle: 45, spacing: 4 }, { angle: 135, spacing: 4 }] },
    wood_blocking: { label: 'Wood blocking (X)', families: [], blockingX: true },
    earth: { label: 'Earth', families: [{ angle: 45, spacing: 2.5 }], dots: 5 },
    gravel: { label: 'Gravel', families: [], dots: 2.2 },
    horizontal: { label: 'Horizontal lines', families: [{ angle: 0, spacing: 1.5 }] },
    vertical: { label: 'Vertical lines', families: [{ angle: 90, spacing: 1.5 }] }
  };

  // Starter controlled vocabulary. pen/hatch are drawing defaults, kind says line vs region.
  QD.MATERIALS = [
    { id: 'concrete', label: 'Concrete', kind: 'region', pen: 'P4', hatch: 'concrete', role: 'structure' },
    { id: 'concrete_masonry', label: 'Concrete masonry (CMU)', kind: 'region', pen: 'P4', hatch: 'masonry', role: 'structure' },
    { id: 'brick', label: 'Brick', kind: 'region', pen: 'P4', hatch: 'masonry', role: 'finish' },
    { id: 'stone', label: 'Stone', kind: 'region', pen: 'P4', hatch: 'cross45', role: 'finish' },
    { id: 'steel', label: 'Steel', kind: 'region', pen: 'P4', hatch: 'steel', role: 'structure' },
    { id: 'aluminum', label: 'Aluminum', kind: 'region', pen: 'P3', hatch: 'solid_screen', role: 'finish' },
    { id: 'wood_framing', label: 'Wood framing', kind: 'region', pen: 'P4', hatch: 'wood_blocking', role: 'structure' },
    { id: 'wood_blocking', label: 'Wood blocking', kind: 'region', pen: 'P3', hatch: 'wood_blocking', role: 'attachment' },
    { id: 'plywood_sheathing', label: 'Plywood sheathing', kind: 'region', pen: 'P3', hatch: 'diag45', role: 'substrate' },
    { id: 'gypsum_board', label: 'Gypsum board', kind: 'region', pen: 'P3', hatch: 'gravel', role: 'finish' },
    { id: 'cement_board', label: 'Cement board', kind: 'region', pen: 'P3', hatch: 'gravel', role: 'substrate' },
    { id: 'batt_insulation', label: 'Batt insulation', kind: 'region', pen: 'P2', hatch: 'batt_insulation_simple', role: 'thermal_layer' },
    { id: 'rigid_insulation', label: 'Rigid insulation', kind: 'region', pen: 'P2', hatch: 'rigid_insulation', role: 'thermal_layer' },
    { id: 'mineral_wool', label: 'Mineral wool', kind: 'region', pen: 'P2', hatch: 'batt_insulation_simple', role: 'thermal_layer' },
    { id: 'spray_foam', label: 'Spray foam', kind: 'region', pen: 'P2', hatch: 'gravel', role: 'thermal_layer' },
    { id: 'waterproofing_membrane', label: 'Waterproofing membrane', kind: 'line', pen: 'P5', role: 'primary_water_barrier' },
    { id: 'roofing_membrane', label: 'Roofing membrane', kind: 'line', pen: 'P5', role: 'primary_water_barrier' },
    { id: 'air_barrier', label: 'Air barrier', kind: 'line', pen: 'P4', role: 'air_barrier' },
    { id: 'vapor_retarder', label: 'Vapor retarder', kind: 'line', pen: 'P2', role: 'vapor_control' },
    { id: 'weather_resistive_barrier', label: 'Weather-resistive barrier', kind: 'line', pen: 'P3', role: 'secondary_water_barrier' },
    { id: 'flashing_metal', label: 'Sheet metal flashing', kind: 'line', pen: 'P4', role: 'primary_water_barrier' },
    { id: 'flashing_self_adhered', label: 'Self-adhered flashing', kind: 'line', pen: 'P4', role: 'primary_water_barrier' },
    { id: 'metal_coping', label: 'Metal coping', kind: 'line', pen: 'P3', role: 'primary_water_barrier' },
    { id: 'sealant', label: 'Sealant', kind: 'region', pen: 'P2', hatch: 'solid_poche', role: 'sealant_joint' },
    { id: 'backer_rod', label: 'Backer rod', kind: 'line', pen: 'P2', role: 'sealant_joint' },
    { id: 'termination_bar', label: 'Termination bar', kind: 'line', pen: 'P4', role: 'attachment' },
    { id: 'drainage_mat', label: 'Drainage mat', kind: 'line', pen: 'P2', role: 'drainage' },
    { id: 'protection_board', label: 'Protection board', kind: 'region', pen: 'P2', hatch: 'none', role: 'substrate' },
    { id: 'earth', label: 'Earth', kind: 'region', pen: 'P2', hatch: 'earth', role: 'existing_context' },
    { id: 'gravel', label: 'Gravel', kind: 'region', pen: 'P2', hatch: 'gravel', role: 'drainage' },
    { id: 'grout', label: 'Grout / mortar', kind: 'region', pen: 'P2', hatch: 'gravel', role: 'structure' },
    { id: 'fastener', label: 'Fastener', kind: 'line', pen: 'P2', role: 'attachment' },
    { id: 'glazing', label: 'Glazing', kind: 'line', pen: 'P2', role: 'finish' },
    { id: 'window_frame', label: 'Window frame', kind: 'region', pen: 'P3', hatch: 'solid_screen', role: 'finish' }
  ];

  QD.ROLES = [
    'primary_water_barrier', 'secondary_water_barrier', 'air_barrier', 'vapor_control', 'thermal_layer',
    'structure', 'substrate', 'finish', 'drainage', 'attachment', 'sealant_joint', 'existing_context',
    'by_others', 'reference'
  ];

  QD.SOURCES = ['architect', 'ai_inferred', 'library', 'imported', 'rule'];
  QD.CONFIDENCE = ['confirmed', 'high', 'medium', 'low'];
  QD.STATUSES = ['draft', 'reviewed', 'locked'];

  QD.RELATIONSHIPS = [
    { id: 'annotates', label: 'annotates' },
    { id: 'laps_over', label: 'laps over' },
    { id: 'laps_under', label: 'laps under' },
    { id: 'continuous_with', label: 'continuous with' },
    { id: 'terminates_at', label: 'terminates at' },
    { id: 'fastened_to', label: 'fastened to' },
    { id: 'bears_on', label: 'bears on' }
  ];

  QD.REVIEW_RESULTS = ['verified_requirement', 'likely_issue', 'open_question'];
  QD.REVIEW_STATES = ['open', 'accepted', 'rejected', 'answered'];

  QD.penById = function (id) { return QD.PENS.find(function (p) { return p.id === id; }) || QD.PENS[2]; };
  QD.materialById = function (id) { return QD.MATERIALS.find(function (m) { return m.id === id; }) || null; };
  QD.scaleRatio = function (label) {
    var s = QD.SCALES.find(function (x) { return x.label === label; });
    return s ? s.ratio : 1;
  };
  QD.humanize = function (id) { return String(id || '').replace(/_/g, ' '); };
})(globalThis.QD = globalThis.QD || {});
