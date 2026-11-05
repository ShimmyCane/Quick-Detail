// California African American Museum (CAAM), Exposition Park, Los Angeles: an AI draft in 10 iterations.
// Same pattern as tools/rand-hall.js: one spec per iteration, checked with SK.authorDetail, recorded as Quick Detail
// scenes in a lane tree, and exported as one viewer file.
//
//   node tools/caam.js
//
// Writes:
//   docs/examples/caam/iter-NN-<name>.json            one spec per iteration (ai_inferred, tagged AI and draft)
//   docs/examples/caam/2d-sheet-iterations-1-to-7.json the main line as one spec
//   docs/caam/history.json                             the lane tree and recordings (quick-detail/history-1)
//   docs/caam/caam-history.html                        the viewer as one exported file, the history inside
// Renders: node tools/caam-render.js
//
// The footprint is traced from OpenStreetMap tiles (z19, about 0.8 ft a pixel). Heights, uses and details are
// assumptions read from public photos (see docs/caam/README.md). Not surveyed.
//
// The 3-D views (plaza elevation, east elevation, isometric) come from one block model. They are drawn with a
// painter's algorithm: every visible face is a solid tone (a solid hatch), drawn far to near, so nearer faces
// hide farther ones.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
['core', 'units', 'hatch', 'annot', 'blocks', 'author', 'lanes'].forEach(function (f) { require(path.join(ROOT, 'sketch', f + '.js')); });
const SK = globalThis.SK;

const SCALE = '1/4"=1\'-0"';
const FT = 12;
const RT2 = Math.SQRT2;
// Text hierarchy, as Rand Hall: titles 6x the paper text, callouts 4x, small labels and dims 3.5x.
// Pass 1: this building is 250 x 349 ft, so the Rand Hall sizes read too small; everything is 1.5x (lesson 13).
const TEXT = { title: { scale: 9, width: 3.9 }, note: { scale: 6, width: 5.25 }, small: { scale: 5, width: 4.65 } };
const DIM_SCALE = 5;

// ---------------------------------------------------------------------------------------------------------------
// The building, in feet. X east, Y north (origin at the south-west corner of the footprint's box), Z up from grade.
// The north-west face is one 45-degree line along the plaza: Y = X + 112, from the west tip (0,112) to the apex (237,349).
// u runs along that face from the west tip; v runs inward (south-east) from it.
// ---------------------------------------------------------------------------------------------------------------
function loc(u, v) { return [(u + v) / RT2, 112 + (u - v) / RT2]; }
function uOf(x, y) { return (x + y - 112) / RT2; }
function vOf(x, y) { return (x - y + 112) / RT2; }

// Traced from the OSM tiles (CCW): see docs/caam/refs/osm-z19-exposition-park.png.
const FOOT = [[0, 112], [14, 98], [46, 98], [46, 61], [125, 61], [125, 0], [140, 0], [140, 17], [244, 17], [244, 77], [228, 93],
  [228, 102], [250, 124], [250, 188], [247, 188], [247, 262], [242, 262], [242, 294], [237, 294], [237, 349],
  [52, 164], [20, 179], [20, 132]];
const H = { gallery: 26, theater: 24, pavilion: 18, loading: 16, offices: 32, courtLow: 26, courtHigh: 42,
  canopy0: 15, canopy1: 19, tower: [34, 40, 46], glass0: 4.5, glass1: 22 };
const COURT_VMAX = vOf(228, 150);
function courtZ(x, y) { return H.courtLow + (H.courtHigh - H.courtLow) * vOf(x, y) / COURT_VMAX; }
const DRUM = { u: 170, r: 20, rc: 16.5, colR: 1.25, cols: [25, 65, 115, 155] };
const TOWER = [[156, 184, 4, 24], [160, 180, 6, 22], [164, 176, 8, 20]];   // u0, u1, v0, v1 for each tier

function rectUV(u0, u1, v0, v1) { return [loc(u0, v0), loc(u0, v1), loc(u1, v1), loc(u1, v0)]; }

// The blocks: a partition of the footprint, plus the things that stand on it or in front of it.
// role picks the tone. top is a height or a function of (x, y).
const BLOCKS = [
  { key: 'theater', name: 'Theater gallery', poly: [[0, 112], [14, 98], [46, 98], [46, 158]], top: H.theater, role: 'wall' },
  { key: 'pavilion', name: 'West pavilion', poly: [[20, 132], [52, 164], [20, 179]], top: H.pavilion, role: 'wall' },
  { key: 'g1', name: 'Gallery 1', poly: [[46, 61], [125, 61], [132, 61], [140, 61], [140, 120], [46, 120]], top: H.gallery, role: 'wall' },
  { key: 'loading', name: 'Loading and storage', poly: [[125, 0], [140, 0], [140, 61], [125, 61]], top: H.loading, role: 'wall' },
  { key: 'g2', name: 'Gallery 2', poly: [[140, 17], [244, 17], [244, 77], [228, 93], [228, 100], [140, 100]], top: H.gallery, role: 'wall' },
  { key: 'g3', name: 'Gallery 3', poly: [[140, 100], [228, 100], [228, 150], [140, 150]], top: H.gallery, role: 'wall' },
  { key: 'lobby', name: 'Lobby', poly: [[46, 120], [140, 120], [140, 252], [46, 158]], top: H.gallery, role: 'wall' },
  { key: 'court', name: 'Sculpture court', poly: [[140, 150], [228, 150], [228, 340], [140, 252]], top: courtZ, role: 'court' },
  { key: 'offices', name: 'Library, offices, conference', poly: [[228, 100], [228, 102], [250, 124], [250, 188], [247, 188], [247, 262], [242, 262], [242, 294], [237, 294], [237, 349], [228, 340]], top: H.offices, role: 'wall' }
];
BLOCKS.forEach(function (b) { b.z0 = 0; });
// The stepped tower over the lobby, behind the entry drum (photos p1, p5).
TOWER.forEach(function (t, i) {
  BLOCKS.push({ key: 'tower' + i, name: 'Tower tier ' + (i + 1), poly: rectUV(t[0], t[1], t[2], t[3]), z0: i ? H.tower[i - 1] : H.gallery, top: H.tower[i], role: 'wall', after: ['lobby', 'court'].concat(i ? ['tower' + (i - 1)] : []) });
});
// Bleacher steps along the sculpture court glass (photo p1).
[[9, 1.5], [6, 3], [3, 4.5]].forEach(function (st, i) {
  BLOCKS.push({ key: 'step' + i, name: 'Steps', poly: rectUV(200, 300, -st[0], 0), z0: 0, top: st[1], role: 'step', detail: true, after: i ? ['step' + (i - 1)] : [] });
});
// The entry drum: a half-round canopy on four round columns, projecting into the plaza.
function drumPoly(r) {
  const pts = [];
  for (let a = 0; a <= 180; a += 15) {
    const t = a * Math.PI / 180;
    pts.push(loc(DRUM.u + r * Math.cos(t), -r * Math.sin(t)));
  }
  return pts.reverse();
}
BLOCKS.push({ key: 'drum', name: 'Entry drum canopy', poly: drumPoly(DRUM.r), z0: H.canopy0, top: H.canopy1, role: 'drum', columns: true });

BLOCKS.forEach(function (b) {
  if (signedArea(b.poly) < 0) b.poly = b.poly.slice().reverse();
  b.topAt = typeof b.top === 'function' ? b.top : function () { return b.top; };
});

function signedArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; }
  return a / 2;
}
function area(p) { return Math.abs(signedArea(p)); }

// ---------------------------------------------------------------------------------------------------------------
// Sheet layout, in real inches (y down). Each view has its own origin.
// ---------------------------------------------------------------------------------------------------------------
const SITE = { x: 0, y: 0, s: 0.25, e0: -300, n1: 560 };      // drawn at 1/4 the sheet scale
const PLAN = { x: 3200, y: 700, top: 360 };
const ROOF = { x: 7900, y: 700, top: 360 };
const PLAZA = { x: 3200, base: 7600, u0: 420 };
const OPTB = { x: 3200, base: 9800, u0: 420 };
const EAST = { x: 8500, base: 7600 };
const SECT = { x: 8500, base: 9800, cutX: 180 };
const ISO = { x: 3200, y: 14000 };

function r(n) { return Math.round(n * 100) / 100; }
function P(x, y) { return [r(x), r(y)]; }
function site(e, n) { return P(SITE.x + (e - SITE.e0) * FT * SITE.s, SITE.y + (SITE.n1 - n) * FT * SITE.s); }
function planAt(o) { return function (X, Y) { return P(o.x + X * FT, o.y + (o.top - Y) * FT); }; }
const plan = planAt(PLAN), roof = planAt(ROOF);

// Projections of a 3-D point [X, Y, Z]: each returns sheet inches, and carries its view direction (into the scene).
function elevation(o, right, look) {
  const f = function (p) { return P(o.x + (o.u0 + p[0] * right[0] + p[1] * right[1]) * FT, o.base - p[2] * FT); };
  f.look = [look[0], look[1], 0];
  return f;
}
// The plaza elevation looks south-east at the 45-degree face; west tip on the right, the apex on the left.
const plazaEl = elevation(PLAZA, [-1 / RT2, -1 / RT2], [1 / RT2, -1 / RT2]);
const optBEl = elevation(OPTB, [-1 / RT2, -1 / RT2], [1 / RT2, -1 / RT2]);
// The east elevation (Figueroa Street) looks west; north on the right.
const eastEl = elevation({ x: EAST.x, u0: 0, base: EAST.base }, [0, 1], [-1, 0]);
// Isometric from the north-west, over the plaza: the 45-degree face reads square-on.
const C30 = Math.cos(Math.PI / 6);
function iso(p) { return P(ISO.x + (p[0] + p[1]) * C30 * FT, ISO.y + ((p[1] - p[0]) * 0.5 - p[2]) * FT); }
iso.look = [1, -1, -1];
function u2(map, u, v, z) { const q = loc(u, v); return map([q[0], q[1], z]); }

// ---------------------------------------------------------------------------------------------------------------
// A builder for one iteration's spec items.
// ---------------------------------------------------------------------------------------------------------------
function Sheet() {
  const items = [];
  const api = {
    items: items,
    line: function (pts, weight, pen) { items.push({ kind: 'line', pts: pts, weight: weight || 'w2', pen: pen }); },
    poly: function (pts, weight, pen) { api.line(pts.concat([pts[0]]), weight, pen); },
    hatch: function (pattern, pts, pen, outline) { items.push({ kind: 'hatch', pattern: pattern, pts: pts, outline: !!outline, pen: pen }); },
    fill: function (pts, tone) { items.push({ kind: 'hatch', pattern: 'steel', pts: pts, outline: false, pen: tone }); },
    // Widths are fitted to the text (pass 2), so notes read as blocks: titles about 7 words a line, callouts about 5,
    // labels of fewer than 4 words on one line. The width argument is kept as a floor.
    note: function (text, at, width, tip, pen, cls) {
      const c = cls || 'note';
      items.push({ kind: 'note', text: text, at: at, width: r(fixedWidth(text) || Math.max(fitWidth(text, c), c === 'small' ? width * TEXT[c].width : 0)), tip: tip, pen: pen, text_class: c });
    },
    title: function (text, at, width, tip) { api.note(text, at, width, tip, undefined, 'title'); },
    small: function (text, at, width, tip, pen) { api.note(text, at, width, tip, pen, 'small'); },
    dim: function (p1, p2, at, pen) { items.push({ kind: 'dim', mode: 'ortho', p1: p1, p2: p2, at: at, pen: pen }); }
  };
  return api;
}

// Where the estimate wraps differently from the page, the width tools/note-blocks.js measured (pass 2).
const WIDTH_FIX = { 'CAAM, 1984': 708, 'Glazed court roof, +26': 517, 'ITERATION 5:': 1224, 'SECTION A AT': 1061 };
function fixedWidth(text) { const k = Object.keys(WIDTH_FIX).find(function (p) { return text.indexOf(p) === 0; }); return k ? WIDTH_FIX[k] : 0; }
// Character width in real inches, calibrated against tools/note-blocks.js (about 17 in at 6x text).
const CHAR_IN = 17 / 6;
function fitWidth(text, cls) {
  const words = text.split(/\s+/), n = words.length;
  const aim = cls === 'title' ? 7 : 5;
  let per = n < 4 ? n : n <= aim + 1 ? n : Math.ceil(n / Math.ceil(n / aim));
  // No single orphan word on the last line: shorten the lines a word at a time until the last has two or more.
  for (let k = per; n > per && k >= 4; k--) { if (n % k !== 1) { per = k; break; } }
  let longest = 0;
  for (let i = 0; i < n; i += per) longest = Math.max(longest, words.slice(i, i + per).join(' ').length);
  return longest * CHAR_IN * TEXT[cls].scale * 1.08 + 10;
}

function northArrow(s, at, len) {
  const [x, y] = at;
  s.line([[x, y + len], [x, y]], 'w3');
  s.line([[x - len * 0.18, y + len * 0.3], [x, y], [x + len * 0.18, y + len * 0.3]], 'w3');
  s.small('N', [x - 14, y - 52], 16, [x, y]);
}

// ---------------------------------------------------------------------------------------------------------------
// Tones. A face's tone comes from its role and how it faces a light from the north-west, above.
// ---------------------------------------------------------------------------------------------------------------
const PALETTE = {
  main: { wall: [196, 188, 176], court: [184, 204, 216], drum: [222, 218, 210], step: [214, 208, 198], roof: [236, 232, 224], glass: '#b9cad6' },
  // Option B: the refresh in photos p4, p5 and p7 (white canopy and colonnade, darker block).
  refresh: { wall: [150, 148, 146], court: [184, 204, 216], drum: [252, 252, 250], step: [226, 224, 220], roof: [236, 234, 230], glass: '#b9cad6' }
};
const LIGHT = norm([-0.55, 0.45, 0.7]);
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function hex(rgb) { return '#' + rgb.map(function (c) { return Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0'); }).join(''); }
function toneFor(pal, role, n, isTop) {
  // The court is glass only on top; its walls are block.
  const base = isTop ? (role === 'court' ? pal.court : pal.roof) : pal[role === 'court' ? 'wall' : role];
  const k = 0.92 + 0.16 * Math.max(0, dot(norm(n), LIGHT));
  return hex(base.map(function (c) { return c * k; }));
}

// ---------------------------------------------------------------------------------------------------------------
// The painter: faces of the blocks, far to near.
// ---------------------------------------------------------------------------------------------------------------
function facesOf(b) {
  const out = [];
  const p = b.poly;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], q = p[(i + 1) % p.length];
    const dx = q[0] - a[0], dy = q[1] - a[1];
    if (Math.hypot(dx, dy) < 0.01) continue;
    out.push({ pts: [[a[0], a[1], b.z0], [q[0], q[1], b.z0], [q[0], q[1], b.topAt(q[0], q[1])], [a[0], a[1], b.topAt(a[0], a[1])]], n: [dy, -dx, 0], side: true, edge: [a, q] });
  }
  const top = p.map(function (a) { return [a[0], a[1], b.topAt(a[0], a[1])]; });
  // Newell's normal of the top.
  const n = [0, 0, 0];
  for (let i = 0; i < top.length; i++) {
    const c = top[i], d = top[(i + 1) % top.length];
    n[0] += (c[1] - d[1]) * (c[2] + d[2]); n[1] += (c[2] - d[2]) * (c[0] + d[0]); n[2] += (c[0] - d[0]) * (c[1] + d[1]);
  }
  out.push({ pts: top, n: n, top: true });
  return out;
}
function centroid(pts) {
  const c = [0, 0, 0];
  pts.forEach(function (q) { c[0] += q[0]; c[1] += q[1]; c[2] += (q[2] || 0); });
  return [c[0] / pts.length, c[1] / pts.length, c[2] / pts.length];
}
function facing(n, look) { return dot(n, look) < -1e-6; }

// The blocks in drawing order for a view: by the depth of their centre, then each block after those it must follow.
function orderBlocks(blocks, look) {
  const depth = {};
  blocks.forEach(function (b) {
    const c = centroid(b.poly);
    depth[b.key] = dot([c[0], c[1], (b.z0 + b.topAt(c[0], c[1])) / 2], look);
  });
  const sorted = blocks.slice().sort(function (a, b) { return depth[b.key] - depth[a.key]; });
  // Stable fix-up for the explicit "after" rules (towers on the lobby, steps in tiers).
  let moved = true, guard = 0;
  while (moved && guard++ < 50) {
    moved = false;
    sorted.forEach(function (b, i) {
      (b.after || []).forEach(function (k) {
        const j = sorted.findIndex(function (x) { return x.key === k; });
        if (j > i) { sorted.splice(i, 1); sorted.splice(j, 0, b); moved = true; }
      });
    });
  }
  return sorted;
}

// Draw the model. opts: pal (palette), detail (deco on), skip (block keys), cmu (block coursing on walls).
function drawModel(s, map, opts) {
  const pal = opts.pal || PALETTE.main;
  const look = map.look;
  const blocks = BLOCKS.filter(function (b) { return (opts.detail || !b.detail) && !(opts.skip || []).includes(b.key); });
  orderBlocks(blocks, look).forEach(function (b) {
    if (b.columns && opts.detail) drumColumns(s, map, pal, look);
    const faces = facesOf(b).filter(function (f) { return facing(f.n, look); });
    faces.sort(function (f, g) { return (f.top ? 1 : 0) - (g.top ? 1 : 0) || dot(centroid(g.pts), look) - dot(centroid(f.pts), look); });
    faces.forEach(function (f) {
      const pts = f.pts.map(map);
      s.fill(pts, toneFor(pal, b.role, f.n, f.top));
      if (opts.detail && b.role === 'wall' && f.side) s.hatch('cmu', pts, 'grey', false);
      s.poly(pts, f.top ? 'w2' : 'w2');
      if (opts.detail && f.side) faceDeco(s, map, b, f, pal);
      if (opts.detail && f.top) roofDeco(s, map, b);
    });
  });
}

// Columns under the drum, as tall boxes seen from the view (round columns read as bars in elevation and iso).
function drumColumns(s, map, pal, look) {
  const cols = DRUM.cols.map(function (a) {
    const t = a * Math.PI / 180;
    return loc(DRUM.u + DRUM.rc * Math.cos(t), -DRUM.rc * Math.sin(t));
  });
  cols.sort(function (a, b) { return dot([b[0], b[1], 0], look) - dot([a[0], a[1], 0], look); });
  const side = norm([-look[1], look[0], 0]);
  cols.forEach(function (c) {
    const a = [c[0] - side[0] * DRUM.colR, c[1] - side[1] * DRUM.colR], b = [c[0] + side[0] * DRUM.colR, c[1] + side[1] * DRUM.colR];
    const pts = [[a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], H.canopy0], [a[0], a[1], H.canopy0]].map(map);
    s.fill(pts, hex(pal.drum));
    s.poly(pts, 'w2');
  });
}

// Detail on the 45-degree plaza face: curtain wall with mullions, entry doors behind the drum.
// Spans in u along the face, glass from z0 to z1, mullions every step feet, block piers every bay feet.
const GLAZING = [
  { block: 'lobby', u0: 78, u1: 148, z0: 0, z1: 20, step: 5, bay: 35 },
  { block: 'lobby', u0: 152, u1: 188, z0: 0, z1: 12, step: 4.5, bay: 0, doors: true },
  { block: 'court', u0: 202, u1: 330, z0: H.glass0, z1: H.glass1, step: 5, bay: 32 }
];
function onDiagonal(f) { return f.edge && Math.abs(vOf(f.edge[0][0], f.edge[0][1])) < 0.6 && Math.abs(vOf(f.edge[1][0], f.edge[1][1])) < 0.6; }
function faceDeco(s, map, b, f, pal) {
  if (!onDiagonal(f)) return;
  GLAZING.filter(function (g) { return g.block === b.key; }).forEach(function (g) {
    const P3 = function (u, z) { const q = loc(u, -0.05); return map([q[0], q[1], z]); };
    s.fill([P3(g.u0, g.z0), P3(g.u1, g.z0), P3(g.u1, g.z1), P3(g.u0, g.z1)], pal.glass);
    for (let u = g.u0; u <= g.u1 + 1e-6; u += g.step) s.line([P3(u, g.z0), P3(u, g.z1)], 'w1', 'ink');
    const tz = g.doors ? 8 : g.z0 + (g.z1 - g.z0) * 0.62;
    s.line([P3(g.u0, tz), P3(g.u1, tz)], 'w1', 'ink');
    if (g.bay) {
      for (let u = g.u0 + g.bay; u < g.u1 - 2; u += g.bay) {
        const pr = [P3(u - 1, g.z0), P3(u + 1, g.z0), P3(u + 1, g.z1), P3(u - 1, g.z1)];
        s.fill(pr, toneFor(pal, 'wall', f.n, false));
        s.poly(pr, 'w2');
      }
    }
    s.poly([P3(g.u0, g.z0), P3(g.u1, g.z0), P3(g.u1, g.z1), P3(g.u0, g.z1)], 'w2');
  });
}
// The sculpture court's glazed roof: glazing bars down the slope, every 10 ft along the face.
function roofDeco(s, map, b) {
  if (b.key !== 'court') return;
  for (let u = 200; u < 335; u += 10) {
    const a = loc(u, 0.5), far = clipCourt(u);
    if (!far) continue;
    s.line([map([a[0], a[1], courtZ(a[0], a[1])]), map([far[0], far[1], courtZ(far[0], far[1])])], 'w1', 'blue');
  }
}
// Where a line inward from the face at u leaves the court (x = 228 or y = 150).
function clipCourt(u) {
  let best = null;
  for (let v = 0.5; v < 200; v += 0.5) {
    const q = loc(u, v);
    if (q[0] > 228 || q[1] < 150 || q[0] < 140) break;
    best = q;
  }
  return best;
}

// ---------------------------------------------------------------------------------------------------------------
// Iteration 1: site (from the OSM tiles; reduced scale).
// ---------------------------------------------------------------------------------------------------------------
function iter1() {
  const s = Sheet();
  s.poly([site(-300, 560), site(460, 560), site(460, -90), site(-300, -90)], 'w1', 'grey');
  // State Drive along the north, Figueroa Street on the east, 38th Street east of Figueroa.
  s.line([site(-300, 385), site(300, 385), site(372, 387)], 'w2');
  s.line([site(-300, 373), site(300, 373), site(372, 375)], 'w2');
  s.note('State Drive', site(-150, 430), 70, site(-120, 379));
  s.line([site(372, 560), site(372, -90)], 'w2');
  s.line([site(395, 560), site(395, -90)], 'w2');
  s.note('South Figueroa Street', site(300, 545), 110, site(383, 500));
  s.line([site(395, 112), site(460, 112)], 'w1');
  s.line([site(395, 98), site(460, 98)], 'w1');
  s.small('W 38th St', site(400, 82), 70, site(420, 105));
  // Samuel Oschin Air and Space Center, west of the plaza.
  s.poly([site(-288, 363), site(75, 363), site(75, 241), site(-16, 241), site(-16, 175), site(-84, 107), site(-85, 54), site(-288, 54)], 'w3', 'grey');
  s.note('Samuel Oschin Air and Space Center', site(-270, 250), 100, site(-150, 200), 'grey');
  // California Science Center north of State Drive.
  s.poly([site(-93, 406), site(110, 406), site(110, 461), site(-93, 461)], 'w2', 'grey');
  s.note('California Science Center buildings (approx.)', site(-280, 545), 120, site(-60, 440), 'grey');
  // The pedestrian plaza along the museum's 45-degree face.
  s.poly([site(75, 363), site(128, 363), site(190, 301), site(0, 112), site(-14, 126), site(-14, 241), site(75, 241)], 'w1', 'blue');
  s.note('Pedestrian plaza from the Science Center to the CAAM entry', site(170, 545), 150, site(110, 320), 'blue');
  // CAAM.
  s.hatch('cmu', FOOT.map(function (q) { return site(q[0], q[1]); }), 'orange', false);
  s.poly(FOOT.map(function (q) { return site(q[0], q[1]); }), 'w4');
  s.note('CAAM, 1984 (Haywood and Proby). About 46,000 sf traced, 44,000 sf published.', site(270, 300), 100, site(200, 220));
  // Garden and path to the south lot.
  s.poly([site(-65, 110), site(125, 60), site(125, -20), site(80, -40), site(-65, 50)], 'w1', 'green');
  s.note('Garden and path from the south parking lot (OSM)', site(-280, 40), 100, site(20, 40), 'green');
  s.line([site(-300, -62), site(252, -62)], 'w1', 'grey');
  s.small('Parking', site(-60, -66), 60, site(-40, -70), 'grey');
  northArrow(s, site(430, 470), 110);
  s.title('ITERATION 1: SITE. Exposition Park, south-east corner. Traced from OpenStreetMap, drawn at 1/4 sheet scale. Not surveyed.',
    site(-300, -110), 300, site(-200, -90));
  return s;
}

// ---------------------------------------------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------------------------------------------

// A miter offset of a CCW polygon (inward for positive d).
function offset(poly, d) {
  const n = poly.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i - 1 + n) % n], p1 = poly[i], p2 = poly[(i + 1) % n];
    const e1 = norm2([p1[0] - p0[0], p1[1] - p0[1]]), e2 = norm2([p2[0] - p1[0], p2[1] - p1[1]]);
    const n1 = [-e1[1], e1[0]], n2 = [-e2[1], e2[0]];
    const a1 = [p0[0] + n1[0] * d, p0[1] + n1[1] * d], a2 = [p1[0] + n2[0] * d, p1[1] + n2[1] * d];
    const cr = e1[0] * e2[1] - e1[1] * e2[0];
    if (Math.abs(cr) < 1e-6) { out.push([p1[0] + n1[0] * d, p1[1] + n1[1] * d]); continue; }
    const t = ((a2[0] - a1[0]) * e2[1] - (a2[1] - a1[1]) * e2[0]) / cr;
    out.push([a1[0] + e1[0] * t, a1[1] + e1[1] * t]);
  }
  return out;
}
function norm2(v) { const l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; }

const WALL = 1.33;   // 16 in split-face block wall (assumed)
function footShell(s, m, opts) {
  const foot = signedArea(FOOT) > 0 ? FOOT : FOOT.slice().reverse();
  const inner = offset(foot, WALL);
  for (let i = 0; i < foot.length; i++) {
    const j = (i + 1) % foot.length;
    const q = [m(foot[i][0], foot[i][1]), m(foot[j][0], foot[j][1]), m(inner[j][0], inner[j][1]), m(inner[i][0], inner[i][1])];
    s.hatch('cmu', q, 'grey', false);
  }
  s.poly(foot.map(function (q) { return m(q[0], q[1]); }), 'w4');
  s.poly(inner.map(function (q) { return m(q[0], q[1]); }), 'w2');
  if (opts.glass) {
    GLAZING.forEach(function (g) {
      const a = loc(g.u0, 0), b = loc(g.u1, 0), a2 = loc(g.u0, WALL), b2 = loc(g.u1, WALL);
      s.fill([m(a[0], a[1]), m(b[0], b[1]), m(b2[0], b2[1]), m(a2[0], a2[1])], '#fbfaf7');
      s.line([m(a[0], a[1]), m(b[0], b[1])], 'w1');
      s.line([m(a2[0], a2[1]), m(b2[0], b2[1])], 'w1');
      const c0 = loc(g.u0, WALL / 2), c1 = loc(g.u1, WALL / 2);
      s.line([m(c0[0], c0[1]), m(c1[0], c1[1])], 'w2', 'blue');
    });
  }
}
function drumPlan(s, m, dashed) {
  const pts = drumPoly(DRUM.r).map(function (q) { return m(q[0], q[1]); });
  s.line(pts, dashed ? 'w1' : 'w2', dashed ? 'grey' : undefined);
  DRUM.cols.forEach(function (a) {
    const t = a * Math.PI / 180, c = loc(DRUM.u + DRUM.rc * Math.cos(t), -DRUM.rc * Math.sin(t));
    const ring = [];
    for (let k = 0; k <= 360; k += 45) ring.push(m(c[0] + DRUM.colR * Math.cos(k * Math.PI / 180), c[1] + DRUM.colR * Math.sin(k * Math.PI / 180)));
    s.hatch('steel', ring, 'ink', false);
  });
}

function iter2() {
  const s = Sheet();
  const m = plan;
  footShell(s, m, { glass: true });
  drumPlan(s, m, false);
  // Overall dimensions.
  s.dim(m(0, -12), m(250, -12), m(125, -22));
  s.dim(m(262, 0), m(262, 349), m(274, 175));
  s.dim(m(140, -4), m(244, -4), m(192, -8));
  // The 45-degree face, labelled along its length.
  s.note('Plaza face: one straight 45-degree wall, about 335 ft long', m(-70, 300), 90, m(150, 262));
  s.note('Entry drum: half-round canopy, 20 ft radius, four round columns', m(-70, 250), 90, u2pl(m, DRUM.u, -DRUM.r));
  s.note('West pavilion, projecting into the plaza', m(-70, 200), 90, m(28, 160));
  s.note('Stepped east wall along Figueroa Street', m(270, 330), 70, m(244, 280));
  s.note('Loading bay to the south', m(60, 20), 70, m(130, 20));
  northArrow(s, m(290, 360), 110);
  s.title('ITERATION 2: TRACED FOOTPRINT AND GROUND SHELL (1/4"=1\'-0"). Traced from OSM at about 0.8 ft a pixel; within 2 ft at best. Walls 16 in block (assumed).',
    m(0, -40), 330, m(10, -2));
  return s;
}
function u2pl(m, u, v) { const q = loc(u, v); return m(q[0], q[1]); }

const PARTITIONS = [
  [[46, 98], [46, 158]], [[46, 120], [140, 120]], [[140, 17], [140, 150]], [[140, 100], [228, 100]], [[140, 150], [228, 150]],
  [[228, 100], [228, 340]], [[132, 61], [140, 61]], [[228, 188], [247, 188]], [[228, 262], [242, 262]]
];
const ROOMS = [
  { key: 'g1', text: 'GALLERY 1', at: [60, 104] },
  { key: 'g2', text: 'GALLERY 2', at: [160, 70] },
  { key: 'g3', text: 'GALLERY 3', at: [160, 138] },
  { key: 'theater', text: 'THEATER GALLERY', at: [2, 150], tip: [22, 116] },
  { key: 'lobby', text: 'LOBBY AND SHOP', at: [62, 196], tip: [90, 170] },
  { key: 'court', text: 'SCULPTURE COURT', at: [160, 222] },
  { key: 'loading', text: 'LOADING, STORAGE', at: [80, 40], tip: [132, 30] }
];
function iter3() {
  const s = Sheet();
  const m = plan;
  PARTITIONS.forEach(function (w) { s.line([m(w[0][0], w[0][1]), m(w[1][0], w[1][1])], 'w3'); });
  // The lobby opens to the court: a dashed line where no wall is assumed.
  s.line([m(140, 150), m(140, 252)], 'w1', 'grey');
  // Rooms with their traced areas.
  ROOMS.forEach(function (rm) {
    const b = BLOCKS.find(function (x) { return x.key === rm.key; });
    const a = Math.round(area(b.poly) / 100) * 100;
    const tip = rm.tip || [rm.at[0] + 10, rm.at[1] - 10];
    s.note(rm.text + ' ~' + a.toLocaleString('en-US') + ' sf', m(rm.at[0], rm.at[1]), 60, m(tip[0], tip[1]));
  });
  s.note('Archive and research library', m(262, 170), 60, m(238, 150));
  s.note('Administration offices', m(262, 238), 60, m(238, 225));
  s.note('Conference and special events room', m(262, 300), 60, m(236, 300));
  // The tower over the lobby, dashed.
  rectUV(TOWER[0][0], TOWER[0][1], TOWER[0][2], TOWER[0][3]).concat([loc(TOWER[0][0], TOWER[0][2])]).forEach(function () {});
  s.line(rectUV(TOWER[0][0], TOWER[0][1], TOWER[0][2], TOWER[0][3]).concat([loc(TOWER[0][0], TOWER[0][2])]).map(function (q) { return m(q[0], q[1]); }), 'w1', 'grey');
  s.note('Stepped tower above (dashed)', m(-70, 150), 90, u2pl(m, 170, 14));
  // Bleacher steps outside the court glass.
  [9, 6, 3].forEach(function (d) { s.line([u2pl(m, 200, -d), u2pl(m, 300, -d)], 'w1'); });
  s.line([u2pl(m, 200, -9), u2pl(m, 200, 0)], 'w1');
  s.line([u2pl(m, 300, -9), u2pl(m, 300, 0)], 'w1');
  s.note('Bleacher steps along the court glass (photo p1)', m(110, 345), 80, u2pl(m, 250, -6));
  const total = Math.round(area(FOOT) / 100) * 100;
  s.title('ITERATION 3: GROUND FLOOR PROGRAM (1/4"=1\'-0"). Rooms from the published list, placed by assumption. Footprint ~' + total.toLocaleString('en-US') + ' sf traced; 44,000 sf published.',
    m(0, -70), 330, m(60, -40));
  return s;
}

function iter4() {
  const s = Sheet();
  const m = roof;
  s.poly(FOOT.map(function (q) { return m(q[0], q[1]); }), 'w4');
  BLOCKS.filter(function (b) { return !b.detail; }).forEach(function (b) {
    s.poly(b.poly.map(function (q) { return m(q[0], q[1]); }), b.key.indexOf('tower') === 0 || b.key === 'drum' ? 'w2' : 'w3');
  });
  // Court glazing bars and the slope arrow.
  for (let u = 200; u < 335; u += 10) {
    const a = loc(u, 0.5), far = clipCourt(u);
    if (far) s.line([m(a[0], a[1]), m(far[0], far[1])], 'w1', 'blue');
  }
  const sa = loc(280, 6), sb = loc(280, 40);
  s.line([m(sa[0], sa[1]), m(sb[0], sb[1])], 'w3');
  s.line([m(sb[0] - 3, sb[1] - 1), m(sb[0], sb[1]), m(sb[0] - 1, sb[1] + 3)], 'w3');
  // Heights.
  const lab = function (text, at, tip) { s.small(text, m(at[0], at[1]), 40, m(tip[0], tip[1]), 'grey'); };
  lab('+26\'', [80, 95], [90, 90]); lab('+26\'', [170, 60], [180, 55]); lab('+26\'', [170, 130], [180, 125]);
  lab('+24\'', [6, 125], [20, 118]); lab('+16\'', [108, 12], [128, 10]); lab('+32\'', [256, 210], [240, 210]);
  s.note('Tower tiers +34, +40, +46 ft', m(-70, 230), 70, u2pl(m, 170, 14));
  s.note('Drum canopy +19 ft', m(-70, 185), 60, u2pl(m, DRUM.u - 10, -DRUM.r + 2));
  s.note('Glazed court roof, +26 ft at the plaza rising to +42 ft', m(150, 370), 90, m(200, 260), 'blue');
  // Section line A, through the court and galleries.
  s.line([m(SECT.cutX, -10), m(SECT.cutX, 300)], 'w3', 'red');
  s.small('A', [m(SECT.cutX, -14)[0] - 10, m(SECT.cutX, -14)[1]], 16, m(SECT.cutX, -10), 'red');
  s.small('A', [m(SECT.cutX, 306)[0] - 10, m(SECT.cutX, 306)[1] - 60], 16, m(SECT.cutX, 300), 'red');
  northArrow(s, m(290, 360), 110);
  s.title('ITERATION 4: ROOF PLAN (1/4"=1\'-0"). Flat roofs at assumed heights, the sloped glazed court roof, the tower and drum. Section A at x = 180 ft.',
    m(0, -40), 330, m(10, -2));
  return s;
}

// ---------------------------------------------------------------------------------------------------------------
// Elevations
// ---------------------------------------------------------------------------------------------------------------
function levels(s, map, at, marks) {
  marks.forEach(function (mk) {
    const a = map([at[0], at[1], mk[1]]);
    const b = [a[0] + 60, a[1]];
    s.line([a, [a[0] + 240, a[1]]], 'w1', 'grey');
    s.small(mk[0] + ' (assumed)', [b[0] + 200, b[1] - 50], 60, [a[0] + 240, a[1]], 'grey');
  });
}
function ground(s, map, from, to) { s.line([map([from[0], from[1], 0]), map([to[0], to[1], 0])], 'w4'); }

function iter5() {
  const s = Sheet();
  ground(s, plazaEl, loc(345, 0), loc(-15, 0));
  drawModel(s, plazaEl, { pal: PALETTE.main, detail: false });
  s.dim(plazaEl([loc(335, 0)[0], loc(335, 0)[1], 0]), plazaEl([0, 112, 0]), [plazaEl([0, 112, 0])[0] - 1500, PLAZA.base + 140]);
  s.title('ITERATION 5: PLAZA ELEVATION, FIRST PASS (1/4"=1\'-0"). Looking south-east at the 45-degree face. Massing only, heights assumed.',
    [plazaEl([0, 112, 0])[0] - 3300, PLAZA.base + 260], 330, plazaEl(loc(150, 0).concat([0])));
  return s;
}

function plazaNotes(s, map, optB) {
  // Pass 2: two staggered rows, so neighbouring callouts never share a line of text.
  const rowA = map([0, 112, 60])[1], rowB = map([0, 112, 74])[1];
  const X = function (u) { return map(loc(u, 0).concat([0]))[0] - 260; };
  const list = !optB ? [
    ['Split-face block walls, warm grey (photo p1)', 40, rowA, u2(map, 30, 0, 16)],
    ['Stepped tower, three tiers to about 46 ft', 130, rowB, u2(map, 172, 20, 44)],
    ['Drum canopy, red lettering on concrete (p1)', 205, rowA, u2(map, 178, -18, 17)],
    ['Sculpture court glass over bleacher steps', 275, rowB, u2(map, 260, 0, 15)],
    ['Glazed court roof seen rising behind', 340, rowA, u2(map, 320, 20, 33)]
  ] : [
    ['Option B: block painted dark grey (photo p5)', 40, rowA, u2(map, 30, 0, 16)],
    ['Yellow exhibition banner on the glass (p5)', 115, rowB, u2(map, 115, 0, 10), 'orange'],
    ['White drum with CAAM lettering (p5)', 205, rowA, u2(map, 178, -18, 17)],
    ['White colonnade and sign beam (p4, p7): place not settled; drawn in the iso note only', 300, rowB, u2(map, 300, 0, 22)]
  ];
  list.forEach(function (n) { s.note(n[0], [X(n[1]), n[2]], 60, n[3], n[4]); });
}

function iter6() {
  const s = Sheet();
  ground(s, plazaEl, loc(345, 0), loc(-15, 0));
  drawModel(s, plazaEl, { pal: PALETTE.main, detail: true });
  levels(s, plazaEl, [0, 112], [['Grade 0\'', 0], ['Parapet +26\'', 26], ['Court roof +42\'', 42]]);
  plazaNotes(s, plazaEl, false);
  s.title('ITERATION 6: PLAZA ELEVATION, SECOND PASS (1/4"=1\'-0"). Curtain walls, block coursing, entry drum and columns, bleacher steps. The face chosen for the iso.',
    [plazaEl([0, 112, 0])[0] - 3300, PLAZA.base + 620], 330, plazaEl(loc(150, 0).concat([0])));
  return s;
}

function iter7() {
  const s = Sheet();
  // East elevation on Figueroa Street.
  ground(s, eastEl, [260, -15], [260, 360]);
  drawModel(s, eastEl, { pal: PALETTE.main, detail: true });
  // A service door at the loading bay and high slot windows in the offices (assumed: no photo of this side).
  const door = [eastEl([250, 4, 0]), eastEl([250, 14, 0]), eastEl([250, 14, 12]), eastEl([250, 4, 12])];
  void door;
  for (let y = 130; y < 185; y += 9) {
    const w = [eastEl([251, y, 22]), eastEl([251, y + 5, 22]), eastEl([251, y + 5, 28]), eastEl([251, y, 28])];
    s.fill(w, PALETTE.main.glass); s.poly(w, 'w1');
  }
  levels(s, eastEl, [250, 362],   // pass 2: X, Y; the east view's axis is Y
    [['Grade 0\'', 0], ['Gallery parapet +26\'', 26], ['Offices +32\'', 32], ['Tower +46\'', 46]]);
  s.note('Blank block walls on Figueroa (assumed: no photo of this side)', [eastEl([0, 20, 0])[0], EAST.base - 64 * FT], 70, eastEl([244, 40, 14]));
  s.note('Slot windows to the offices (assumed)', [eastEl([0, 140, 0])[0], EAST.base - 64 * FT], 60, eastEl([250, 150, 26]));
  s.note('Court roof and tower seen over the offices', [eastEl([0, 250, 0])[0], EAST.base - 64 * FT], 60, eastEl([228, 230, 38]));
  s.dim(eastEl([250, 0, 0]), eastEl([250, 349, 0]), [eastEl([250, 175, 0])[0], EAST.base + 120]);
  s.title('EAST ELEVATION ON FIGUEROA STREET (1/4"=1\'-0"). Looking west; north on the right.', [EAST.x, EAST.base + 260], 250, eastEl([250, 30, 0]));

  // Section A at x = 180, looking west; north on the right.
  const x = function (Y, Z) { return P(SECT.x + Y * FT, SECT.base - Z * FT); };
  const yd = SECT.cutX + 112;                       // the plaza face at x = 180
  s.line([x(-15, 0), x(yd + 30, 0)], 'w4');
  s.hatch('earth', [x(-15, 0), x(yd + 30, 0), x(yd + 30, -5), x(-15, -5)], 'green', false);
  // Slab on grade.
  s.hatch('concrete', [x(17, 0), x(yd, 0), x(yd, -0.5), x(17, -0.5)], 'ink', true);
  // Cut walls: south wall, gallery partitions, the plaza glass wall.
  [[17, H.gallery], [100, H.gallery], [150, courtZ(SECT.cutX, 150)]].forEach(function (w) {
    s.hatch('cmu', [x(w[0], 0), x(w[0] + WALL, 0), x(w[0] + WALL, w[1]), x(w[0], w[1])], 'grey', true);
  });
  s.hatch('cmu', [x(yd - WALL, H.glass1), x(yd, H.glass1), x(yd, H.courtLow), x(yd - WALL, H.courtLow)], 'grey', true);
  s.hatch('cmu', [x(yd - WALL, 0), x(yd, 0), x(yd, H.glass0), x(yd - WALL, H.glass0)], 'grey', true);
  s.line([x(yd - WALL / 2, H.glass0), x(yd - WALL / 2, H.glass1)], 'w3', 'blue');
  // Gallery roofs: deck on joists.
  [[17, 100], [100, 150]].forEach(function (g) {
    s.hatch('steel', [x(g[0], H.gallery - 0.4), x(g[1], H.gallery - 0.4), x(g[1], H.gallery), x(g[0], H.gallery)], 'ink', false);
    s.line([x(g[0], H.gallery - 3), x(g[1], H.gallery - 3)], 'w1');
    for (let y = g[0] + 4; y < g[1]; y += 4) s.line([x(y, H.gallery - 3), x(y + 2, H.gallery - 0.4)], 'w1');
  });
  // Court roof: a 4 ft space frame under the glass, sloping down to the plaza.
  const zc = function (Y) { return courtZ(SECT.cutX, Y); };
  s.line([x(150, zc(150)), x(yd, zc(yd))], 'w3', 'blue');
  s.line([x(150, zc(150) - 4), x(yd, zc(yd) - 4)], 'w2');
  for (let y = 150; y < yd - 6; y += 6) {
    s.line([x(y, zc(y) - 4), x(y + 3, zc(y + 3)), x(y + 6, zc(y + 6) - 4)], 'w1');
  }
  // Bleacher steps outside the glass (cut at 45 degrees, so each 3 ft tread reads 4'-3").
  const t = 3 * RT2;
  s.line([x(yd, H.glass0), x(yd + t, H.glass0), x(yd + t, 3), x(yd + 2 * t, 3), x(yd + 2 * t, 1.5), x(yd + 3 * t, 1.5), x(yd + 3 * t, 0)], 'w2');
  // The tower beyond, in grey.
  const tw = [[205, 239, 34], [210, 234, 40], [215, 229, 46]];
  s.line([x(205, 26), x(205, 34), x(210, 34), x(210, 40), x(215, 40), x(215, 46), x(229, 46), x(229, 40), x(234, 40), x(234, 34), x(239, 34), x(239, 26)], 'w1', 'grey');
  void tw;
  s.note('Glazed space-frame roof, falling to the plaza', [x(150, 0)[0], SECT.base - 62 * FT], 60, x(200, zc(200)), 'blue');
  s.note('Sculpture court, about 26 to 38 ft high here', [x(185, 0)[0], SECT.base - 18 * FT], 50, x(240, 15));
  s.note('Gallery 2', [x(30, 0)[0], SECT.base - 18 * FT], 30, x(50, 8));
  s.note('Gallery 3', [x(110, 0)[0], SECT.base - 18 * FT], 30, x(125, 8));
  s.note('Tower beyond (grey)', [x(250, 0)[0], SECT.base - 62 * FT], 40, x(229, 44), 'grey');
  s.title('SECTION A AT X = 180 FT, LOOKING WEST (1/4"=1\'-0"). Galleries, sculpture court, plaza glass and steps.', [SECT.x, SECT.base + 120], 250, x(30, 0));
  s.title('ITERATION 7: EAST ELEVATION AND SECTION A.', [EAST.x, EAST.base + 620], 250, eastEl([250, 10, 0]));
  return s;
}

// Branch from 6: the plaza elevation as refreshed (photos p4, p5, p7).
function iter8() {
  const s = Sheet();
  ground(s, optBEl, loc(345, 0), loc(-15, 0));
  drawModel(s, optBEl, { pal: PALETTE.refresh, detail: true });
  // The yellow banner on the lobby glass.
  const ban = [u2(optBEl, 100, -0.1, 3), u2(optBEl, 130, -0.1, 3), u2(optBEl, 130, -0.1, 17), u2(optBEl, 100, -0.1, 17)];
  s.fill(ban, '#e8c547'); s.poly(ban, 'w2');
  plazaNotes(s, optBEl, true);
  s.title('ITERATION 8 (BRANCH FROM 6): PLAZA ELEVATION, OPTION B, THE REFRESH (1/4"=1\'-0"). Same massing as 6; the later colours and graphics in photos p4, p5 and p7. Dates not confirmed.',
    [optBEl([0, 112, 0])[0] - 3300, OPTB.base + 260], 330, optBEl(loc(150, 0).concat([0])));
  return s;
}

// ---------------------------------------------------------------------------------------------------------------
// Isometric from the north-west, over the plaza.
// ---------------------------------------------------------------------------------------------------------------
function isoGround(s) {
  // The plaza and the street edges, on the ground plane.
  s.poly([iso([75, 363, 0]), iso([128, 363, 0]), iso([190, 301, 0]), iso([0, 112, 0]), iso([-14, 126, 0]), iso([-14, 241, 0]), iso([75, 241, 0])], 'w1', 'grey');
}
function iter9() {
  const s = Sheet();
  isoGround(s);
  drawModel(s, iso, { pal: PALETTE.main, detail: false });
  s.title('ITERATION 9 (BRANCH FROM 7): ISOMETRIC MASSING FROM THE NORTH-WEST. The plaza face (iterations 5 and 6) is the most worked-out view, so it faces the viewer.',
    [ISO.x, ISO.y + 1150], 330, iso([0, 112, 0]));
  return s;
}
function iter10() {
  const s = Sheet();
  isoGround(s);
  drawModel(s, iso, { pal: PALETTE.main, detail: true });
  s.note('Stepped tower over the lobby', [iso([60, 300, 0])[0], ISO.y - 2100], 60, iso(loc(170, 14).concat([46])));
  s.note('Glazed sculpture court roof, rising from the plaza', [iso([200, 380, 0])[0], ISO.y - 2100], 70, iso(loc(290, 40).concat([courtZ(loc(290, 40)[0], loc(290, 40)[1])])), 'blue');
  s.note('Entry drum on four columns', [iso([0, 240, 0])[0] - 400, ISO.y + 700], 60, iso(loc(170, -20).concat([16])));
  s.note('Bleacher steps and court glass', [iso([150, 380, 0])[0], ISO.y + 700], 60, iso(loc(250, -6).concat([2])));
  s.note('Library, offices and conference along Figueroa', [iso([300, 300, 0])[0] + 200, ISO.y - 1900], 60, iso([245, 230, 32]));
  s.title('ITERATION 10 (FINAL): ISOMETRIC FROM THE NORTH-WEST, DETAILED. Curtain walls, block, drum, steps, court glazing. AI draft from OSM and public photos; verify before use.',
    [ISO.x, ISO.y + 1500], 330, iso([0, 112, 0]));
  return s;
}

// ---------------------------------------------------------------------------------------------------------------
// The iterations, the lane each belongs to, and what was "said" in each scene.
// ---------------------------------------------------------------------------------------------------------------
const ITERS = [
  { n: 1, lane: 'main', file: 'site', fn: iter1, said: 'Iteration 1. Site from the OpenStreetMap tiles: the south-east corner of Exposition Park, State Drive, Figueroa Street, the Air and Space Center, and the plaza that meets the museum on a 45-degree face.' },
  { n: 2, lane: 'main', file: 'footprint-shell', fn: iter2, said: 'Iteration 2. The traced footprint as a ground shell: 250 by 349 feet, the long plaza face, the entry drum, the pavilion and the stepped Figueroa wall.' },
  { n: 3, lane: 'main', file: 'ground-program', fn: iter3, said: 'Iteration 3. Program on the ground floor: three galleries, the theater gallery, lobby, sculpture court, library, offices and conference room, each with its traced area.' },
  { n: 4, lane: 'main', file: 'roof-plan', fn: iter4, said: 'Iteration 4. Roof plan: flat roofs at assumed heights, the sloped glazed court roof, the stepped tower, the drum and section line A.' },
  { n: 5, lane: 'main', file: 'plaza-elevation-v1', fn: iter5, said: 'Iteration 5. Plaza elevation, first pass: the block model drawn far to near, massing only.' },
  { n: 6, lane: 'main', file: 'plaza-elevation-v2', fn: iter6, said: 'Iteration 6. Plaza elevation, second pass: curtain walls, block coursing, the drum and its columns, the steps. This face is chosen for the isometric.' },
  { n: 7, lane: 'main', file: 'east-elevation-section', fn: iter7, said: 'Iteration 7. East elevation on Figueroa Street, and section A through the galleries and the sculpture court.' },
  { n: 8, lane: 'refresh', file: 'plaza-elevation-option-b', fn: iter8, said: 'Iteration 8, a branch from 6. The plaza elevation as refreshed in the later photos: white drum, CAAM lettering, darker block.' },
  { n: 9, lane: 'iso', file: 'isometric-massing', fn: iter9, said: 'Iteration 9, a branch from 7. Isometric massing from the north-west, over the plaza.' },
  { n: 10, lane: 'iso', file: 'isometric-detailed', fn: iter10, said: 'Iteration 10, final. The detailed isometric: curtain walls, block, drum, steps and court glazing.' }
];

const NAME = 'California African American Museum, Exposition Park: plans, elevations, isometric (AI draft)';
const TAGS = ['AI', 'draft', 'CAAM', 'Los Angeles', 'museum', 'plan', 'elevation', 'isometric'];
const T0 = Date.parse('2026-11-05T18:00:00Z');
const LANES = {
  main: { id: 'ai-draft-caam', name: NAME, parentId: null, fork: null, created: T0 },
  refresh: { id: 'ai-draft-caam-refresh', name: 'CAAM: plaza elevation, option B, the refresh (AI draft)', parentId: 'ai-draft-caam', fork: { step: 6 }, created: T0 + 1 },
  iso: { id: 'ai-draft-caam-iso', name: 'CAAM: isometric from the north-west (AI draft)', parentId: 'ai-draft-caam', fork: { step: 7 }, created: T0 + 2 }
};
const TEXT_SCALE = { title: TEXT.title.scale, note: TEXT.note.scale, small: TEXT.small.scale, dim: DIM_SCALE };

function buildIter(it) {
  const spec = { text_scale: TEXT_SCALE, name: 'CAAM iteration ' + it.n + ': ' + it.file.replace(/-/g, ' ') + ' (AI draft)', scale: SCALE, ai_inferred: true, tags: TAGS.concat(['iteration ' + it.n]), items: it.fn().items };
  const made = SK.authorDetail(spec);
  made.items.forEach(function (x) {
    x.id = 'i' + it.n + '-' + x.id;
    if (x.leaders) x.leaders.forEach(function (l, k) { l.id = x.id + 'l' + k; });
  });
  return { spec: spec, items: made.items };
}

function animate(items, start, budget) {
  const per = Math.max(20, Math.floor(budget / items.length));
  const events = [];
  let t = start;
  items.forEach(function (x) {
    if (x.kind === 'stroke') {
      const lens = [];
      let len = 0;
      x.pts.forEach(function (p, i) { if (i) len += Math.hypot(p[0] - x.pts[i - 1][0], p[1] - x.pts[i - 1][1]); lens.push(len); });
      const dur = Math.max(per * 0.8, 10);
      x.t0 = t;
      x.pts = x.pts.map(function (p, i) { return [p[0], p[1], 0.5, Math.round(len ? dur * lens[i] / len : 0)]; });
      events.push({ t: t, type: 'put', item: x, anim: true });
    } else events.push({ t: t, type: 'put', item: x });
    t += per;
  });
  return { events: events, end: t };
}

function main() {
  const specDir = path.join(ROOT, 'docs', 'examples', 'caam');
  const outDir = path.join(ROOT, 'docs', 'caam');
  fs.mkdirSync(specDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  const built = ITERS.map(function (it) {
    const b = buildIter(it);
    const file = 'iter-' + String(it.n).padStart(2, '0') + '-' + it.file + '.json';
    fs.writeFileSync(path.join(specDir, file), JSON.stringify(b.spec, null, 1) + '\n');
    return Object.assign({ specFile: file }, it, b);
  });

  const sheet2d = {
    name: 'CAAM, Exposition Park: 2-D sheet, iterations 1 to 7 (AI draft)', scale: SCALE, ai_inferred: true,
    tags: TAGS.concat(['2-D sheet']), text_scale: TEXT_SCALE,
    items: [].concat.apply([], built.filter(function (b) { return b.lane === 'main'; }).map(function (b) { return b.spec.items; }))
  };
  fs.writeFileSync(path.join(specDir, '2d-sheet-iterations-1-to-7.json'), JSON.stringify(sheet2d, null, 1) + '\n');

  const sessions = [];
  const endState = {};
  ['main', 'refresh', 'iso'].forEach(function (key, li) {
    const lane = LANES[key];
    let base = [];
    if (lane.parentId) {
      const parentKey = Object.keys(LANES).filter(function (k) { return LANES[k].id === lane.parentId; })[0];
      base = endState[parentKey + ':' + lane.fork.step].slice();
    }
    const mine = built.filter(function (b) { return b.lane === key; });
    const events = [], speech = [];
    let t = 500, state = base.slice(), step = 0;
    mine.forEach(function (b, i) {
      if (i) events.push({ t: t, type: 'mark' });
      speech.push({ t: t, text: b.said });
      const a = animate(b.items, t + 200, 16000);
      a.events.forEach(function (ev) { events.push(ev); });
      state = state.concat(b.items);
      step++;
      endState[key + ':' + step] = state.slice();
      t = a.end + 4500;
    });
    sessions.push({ id: 'ai-draft-caam-r' + li, detailId: lane.id, created: T0 + 1000 * (li + 1), duration: t, scale: SCALE, base: base, events: events, speech: speech, voice: [], audioOffset: 0, notes: [] });
    lane.items = state;
  });

  sessions.forEach(function (s) {
    const scenes = SK.segment(s);
    const mine = built.filter(function (b) { return LANES[b.lane].id === s.detailId; });
    if (scenes.length !== mine.length) throw new Error('lane ' + s.detailId + ' has ' + scenes.length + ' scenes, expected ' + mine.length);
    scenes.forEach(function (m, i) {
      s.notes.push({ key: SK.sceneKey(s.id, m.start), text: 'Spec: docs/examples/caam/' + mine[i].specFile + ' · ' + mine[i].items.length + ' items', at: T0 + 5000 });
    });
  });

  const details = Object.keys(LANES).map(function (k) {
    const l = LANES[k];
    return { id: l.id, name: l.name, scale: SCALE, tags: TAGS, items: l.items, parentId: l.parentId, fork: l.fork, created: l.created, modified: T0 + 9000, rating: 1, ai_inferred: true };
  });
  const bundle = { schema: 'quick-detail/history-1', exported: new Date(T0 + 10000).toISOString(), details: details, sessions: sessions.map(function (s) { return Object.assign({ hasAudio: false }, s); }) };
  fs.writeFileSync(path.join(outDir, 'history.json'), JSON.stringify(bundle));

  let html = fs.readFileSync(path.join(ROOT, 'viewer.html'), 'utf8');
  const json = JSON.stringify(bundle).replace(/<\//g, '<\\/');
  html = html.replace(/<script type="application\/json" id="bundle">[\s\S]*?<\/script>/, function () { return '<script type="application/json" id="bundle">' + json + '</script>'; });
  html = html.replace(/<link rel="stylesheet" href="(sketch\/[^"]+)">|<script src="(sketch\/[^"]+)"><\/script>/g, function (m, css, js) {
    const t = fs.readFileSync(path.join(ROOT, css || js), 'utf8');
    if (css) return '<style>\n' + t.replace(/<\/style/gi, '<\\/style') + '\n</style>';
    return '<script>\n' + t.replace(/<\/script/gi, '<\\/script') + '\n</script>';
  });
  html = html.replace('<title>Edit history · Quick Detail</title>', '<title>CAAM Iterations</title>');
  fs.writeFileSync(path.join(outDir, 'caam-history.html'), html);

  built.forEach(function (b) { console.log('iteration ' + b.n + ' (' + b.lane + '): ' + b.items.length + ' items · ' + b.specFile); });
  sessions.forEach(function (s) { console.log(s.detailId + ': ' + SK.segment(s).length + ' scenes, ' + Math.round(s.duration / 1000) + ' s'); });
  console.log('footprint ' + Math.round(area(FOOT)) + ' sf; court ' + Math.round(area(BLOCKS.find(function (b) { return b.key === 'court'; }).poly)) + ' sf');
}

main();
