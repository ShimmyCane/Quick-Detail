// Rand Hall, Cornell (as it stood in the 2000s, when it held the architecture studios): an AI draft in 10 iterations.
// Builds one drawing spec per iteration, checks each with SK.authorDetail, and writes the iterations as Quick Detail
// recordings (one scene per iteration) in a lane tree, so the edit-history viewer shows them as steps and branches.
//
//   node tools/rand-hall.js
//
// Writes:
//   docs/examples/rand-hall/iter-NN-<name>.json   one spec per iteration (ai_inferred, tagged AI and draft)
//   docs/rand-hall/history.json                   the lane tree and recordings (quick-detail/history-1)
//   docs/rand-hall/rand-hall-history.html         the viewer as one exported file, the history inside
// Renders are made by tools/rand-hall-render.js from the exported file.
//
// Every dimension is an assumption built from published facts (see docs/rand-hall/README.md). Not surveyed.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
['core', 'units', 'hatch', 'annot', 'blocks', 'author', 'lanes'].forEach(function (f) { require(path.join(ROOT, 'sketch', f + '.js')); });
const SK = globalThis.SK;

const SCALE = '1/4"=1\'-0"';
const FT = 12;
// Notes and dimensions at 2.5 times the paper size, so they read on a 200 ft building at 1/4". Note widths grow with them.
const TEXT_SCALE = 2.5, WS = 2.2;

// ---------------------------------------------------------------------------------------------------------------
// The building, in feet. X runs east along the long side, Y runs north, Z is up from grade.
// ---------------------------------------------------------------------------------------------------------------
const B = {
  L: 200, W: 52,               // footprint: 50 ft clear span wall to wall (Architectural Record) plus 1'-6" walls
  bay: 20, nb: 10,             // 10 bays of 20 ft on the long sides (assumed; 20 new roof beams = 2 per bay)
  pier: 2.5, corner: 4,        // brick piers between the window openings, wider at the corners
  wall: 1.5,
  colY: 26,                    // one interior line of steel columns down the middle (assumed)
  F: [1.5, 15.5, 28.5],        // floor levels above grade
  roof: 40, parapet: 43,       // ~43 ft above grade before the renovation (Ochshorn)
  peak: 46,                    // sawtooth ridges (assumed rise of 6 ft)
  teeth: 4,
  sills: [4.5, 18.5, 31.5],
  heads: [13.5, 26.5, 38]
};
const toothLen = (B.W - 2) / B.teeth;             // teeth between Y = 1 and Y = 51
const grids = [];
for (let i = 0; i <= B.nb; i++) grids.push(i * B.bay);

// The window openings between piers along a face of length len, with piers at the given grid positions.
function openings(gridList, len, pier, corner) {
  const out = [];
  for (let i = 0; i < gridList.length - 1; i++) {
    const g0 = gridList[i], g1 = gridList[i + 1];
    const a = g0 === 0 ? corner : g0 + pier / 2;
    const b = g1 === len ? len - corner : g1 - pier / 2;
    out.push([a, b]);
  }
  return out;
}
const southOpenings = openings(grids, B.L, B.pier, B.corner);
const endGrids = [0, B.colY, B.W];
const endOpenings = openings(endGrids, B.W, B.pier, B.corner);

// ---------------------------------------------------------------------------------------------------------------
// Sheet layout, in real inches (y down). Each view has its own origin.
// ---------------------------------------------------------------------------------------------------------------
const SITE = { x: 0, y: 0, s: 0.25, e0: -260, n1: 230 };         // drawn at 1/4 the sheet scale
const PLAN = { x: 2300, rows: { f1: 0, f3: 1000, roof: 2000 } };
const ELEV = { x: 5600, south: 760, north: 1700 };
const END = { x: 8700, base: 760 };
const SECT = { x: 9900, base: 760 };
const ISO = { x: 5600, y: 3300 };

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
    note: function (text, at, width, tip, pen) { items.push({ kind: 'note', text: text, at: at, width: r(width * WS), tip: tip, pen: pen }); },
    dim: function (p1, p2, at, pen) { items.push({ kind: 'dim', mode: 'ortho', p1: p1, p2: p2, at: at, pen: pen }); }
  };
  return api;
}

function r(n) { return Math.round(n * 100) / 100; }
function P(x, y) { return [r(x), r(y)]; }

// Site plan: east and north in feet to sheet inches, at the site's reduced scale.
function site(e, n) { return P(SITE.x + (e - SITE.e0) * FT * SITE.s, SITE.y + (SITE.n1 - n) * FT * SITE.s); }
// Plans: north at the top.
function plan(row) { const oy = PLAN.rows[row]; return function (X, Y) { return P(PLAN.x + X * FT, oy + (B.W - Y) * FT); }; }
// South elevation: looking north, west on the left.
function southEl(X, Z) { return P(ELEV.x + X * FT, ELEV.south - Z * FT); }
// North elevation: looking south, east on the left.
function northEl(X, Z) { return P(ELEV.x + (B.L - X) * FT, ELEV.north - Z * FT); }
// East elevation: looking west, north on the right.
function eastEl(Y, Z) { return P(END.x + Y * FT, END.base - Z * FT); }
// Cross section, looking west, north on the right.
function sect(Y, Z) { return P(SECT.x + Y * FT, SECT.base - Z * FT); }
// Isometric from the southeast: the south and east faces and the roof show.
const C30 = Math.cos(Math.PI / 6), S30 = 0.5;
function iso(X, Y, Z) { return P(ISO.x + (X + Y) * C30 * FT, ISO.y + ((X - Y) * S30 - Z) * FT); }

function rectOn(map, a0, z0, a1, z1) { return [map(a0, z0), map(a1, z0), map(a1, z1), map(a0, z1)]; }

function northArrow(s, at, len) {
  const [x, y] = at;
  s.line([[x, y + len], [x, y]], 'w3');
  s.line([[x - len * 0.18, y + len * 0.3], [x, y], [x + len * 0.18, y + len * 0.3]], 'w3');
  s.note('N', [x - 10, y - 26], 20, [x, y]);
}

// ---------------------------------------------------------------------------------------------------------------
// Iteration 1: site and footprint (schematic, from the published descriptions; not surveyed).
// ---------------------------------------------------------------------------------------------------------------
function iter1() {
  const s = Sheet();
  // Frame of the site drawing.
  s.poly([site(-260, 230), site(340, 230), site(340, -260), site(-260, -260)], 'w1', 'grey');
  // Fall Creek gorge, north of University Avenue.
  const gorge = [];
  for (let e = -260; e <= 340; e += 30) gorge.push(site(e, 175 + 14 * Math.sin(e / 45)));
  s.line(gorge, 'w2', 'green');
  const gorge2 = [];
  for (let e = -260; e <= 340; e += 30) gorge2.push(site(e, 205 + 10 * Math.sin(e / 38 + 1)));
  s.line(gorge2, 'w1', 'green');
  s.note('Fall Creek gorge (schematic)', site(-240, 226), 260, site(-150, 205 + 10 * Math.sin(-150 / 38 + 1)), 'green');
  // University Avenue: a band bending up to the east.
  const road = function (e, off) { return site(e, 78 + off + 0.09 * (e + 260)); };
  const r1 = [], r2 = [];
  for (let e = -260; e <= 340; e += 40) { r1.push(road(e, 0)); r2.push(road(e, 32)); }
  s.line(r1, 'w2');
  s.line(r2, 'w2');
  s.note('University Avenue', site(-40, 150), 200, road(-20, 16));
  // Rand Hall.
  s.hatch('brick', [site(0, 0), site(B.L, 0), site(B.L, B.W), site(0, B.W)], 'orange', true);
  s.poly([site(0, 0), site(B.L, 0), site(B.L, B.W), site(0, B.W)], 'w4');
  s.note('RAND HALL (1911, Gibb & Waltz). Three-story yellow-brick daylight-factory shop building; architecture studios in the 2000s. Footprint about 200 x 52 ft (assumed from 32,915 gsf over 3 floors and the 50 ft span).',
    site(220, 52), 330, site(180, 30));
  // Sibley Hall to the south, with its dome at the middle.
  s.poly([site(-250, -60), site(250, -60), site(250, -112), site(-250, -112)], 'w3');
  s.poly([site(-22, -58), site(22, -58), site(22, -114), site(-22, -114)], 'w2');
  const dome = [];
  for (let a = 0; a <= 360; a += 20) dome.push(site(16 * Math.cos(a * Math.PI / 180), -86 + 16 * Math.sin(a * Math.PI / 180)));
  s.line(dome, 'w1');
  s.note('Sibley Hall (architecture, AAP), dome at its middle', site(-240, -130), 330, site(-150, -86));
  // The Foundry, west of Rand.
  s.poly([site(-95, 12), site(-35, 12), site(-35, 56), site(-95, 56)], 'w3');
  s.note('The Foundry', site(-250, 40), 120, site(-95, 34));
  // The gap where Milstein Hall was later built.
  s.poly([site(-30, -55), site(-4, -55), site(-4, 70), site(-30, 70)], 'w1', 'red');
  s.note('Gap between Foundry, Sibley and Rand: later the site of Milstein Hall (OMA, 2011). Open in the 2000s.',
    site(-250, -10), 280, site(-17, 0), 'red');
  // The Arts Quad.
  s.poly([site(-200, -140), site(200, -140), site(200, -250), site(-200, -250)], 'w1', 'green');
  s.note('Arts Quad', site(-30, -190), 120, site(0, -200), 'green');
  s.note('East Avenue (approx.)', site(270, -150), 150, site(300, -100));
  s.line([site(300, -260), site(300, 110)], 'w1');
  northArrow(s, site(320, 140), 100);
  s.note('ITERATION 1: SITE AND FOOTPRINT. Drawn at 1/4 of the sheet scale. Schematic from published descriptions: north-east corner of the Arts Quad, behind Sibley, along University Ave. Not surveyed.',
    site(-250, -268), 600, site(0, -250));
  return s;
}

// ---------------------------------------------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------------------------------------------

// The shell shared by every floor: grid, piers, openings with glazing, end walls, columns.
function planShell(s, row, opts) {
  const m = plan(row);
  // Grid lines and bubbles.
  grids.forEach(function (g, i) {
    s.line([m(g, -10), m(g, B.W + 10)], 'w1', 'grey');
    if (opts.bubbles) s.note(String(i + 1), [m(g, B.W + 14)[0] - 6, m(g, B.W + 14)[1] - 14], 16, m(g, B.W + 10), 'grey');
  });
  [['A', 0], ['B', B.colY], ['C', B.W]].forEach(function (gy) {
    s.line([m(-10, gy[1]), m(B.L + 10, gy[1])], 'w1', 'grey');
    if (opts.bubbles) s.note(gy[0], [m(-16, gy[1])[0] - 10, m(-16, gy[1])[1] - 6], 16, m(-10, gy[1]), 'grey');
  });
  // Long walls: piers and openings.
  [[0, B.wall], [B.W - B.wall, B.W]].forEach(function (yy, side) {
    grids.forEach(function (g) {
      let a = g - B.pier / 2, b = g + B.pier / 2;
      if (g === 0) { a = 0; b = B.corner; }
      if (g === B.L) { a = B.L - B.corner; b = B.L; }
      const y0 = side === 0 ? 0 : B.W - 2.5, y1 = side === 0 ? 2.5 : B.W;
      const pr = [m(a, y0), m(b, y0), m(b, y1), m(a, y1)];
      s.hatch('brick', pr, 'orange', false);
      s.poly(pr, 'w3');
    });
    southOpenings.forEach(function (o) {
      s.line([m(o[0], yy[0]), m(o[1], yy[0])], 'w1');
      s.line([m(o[0], yy[1]), m(o[1], yy[1])], 'w1');
      s.line([m(o[0], (yy[0] + yy[1]) / 2), m(o[1], (yy[0] + yy[1]) / 2)], 'w2', 'blue');
    });
  });
  // End walls.
  [[0, B.wall], [B.L - B.wall, B.L]].forEach(function (xx) {
    const pr = [m(xx[0], B.colY - 1.25), m(xx[1] + (xx[0] === 0 ? 1 : 0), B.colY - 1.25), m(xx[1] + (xx[0] === 0 ? 1 : 0), B.colY + 1.25), m(xx[0], B.colY + 1.25)];
    s.hatch('brick', pr, 'orange', false);
    endOpenings.forEach(function (o) {
      const door = opts.doors && o[0] < B.colY;
      if (door) {
        // A pair of doors in the south bay of each end wall, centred in the opening.
        const c = (o[0] + o[1]) / 2;
        s.line([m(xx[0], o[0]), m(xx[0], c - 3)], 'w1');
        s.line([m(xx[1], o[0]), m(xx[1], c - 3)], 'w1');
        s.line([m(xx[0], c + 3), m(xx[0], o[1])], 'w1');
        s.line([m(xx[1], c + 3), m(xx[1], o[1])], 'w1');
        const inside = xx[0] === 0 ? xx[1] : xx[0];
        const dir = xx[0] === 0 ? 1 : -1;
        [[c - 3, 1], [c + 3, -1]].forEach(function (h) {
          const hinge = h[0];
          s.line([m(inside, hinge), m(inside + dir * 3, hinge)], 'w2');
          const arc = [];
          for (let a = 0; a <= 90; a += 15) {
            const t = a * Math.PI / 180;
            arc.push(m(inside + dir * 3 * Math.cos(t), hinge + h[1] * 3 * Math.sin(t)));
          }
          s.line(arc, 'w1');
        });
      } else {
        s.line([m(xx[0], o[0]), m(xx[0], o[1])], 'w1');
        s.line([m(xx[1], o[0]), m(xx[1], o[1])], 'w1');
        s.line([m((xx[0] + xx[1]) / 2, o[0]), m((xx[0] + xx[1]) / 2, o[1])], 'w2', 'blue');
      }
    });
  });
  // Corners as solid brick.
  [[0, 0], [B.L - B.corner, 0], [0, B.W - B.corner], [B.L - B.corner, B.W - B.corner]].forEach(function (c) {
    s.poly([m(c[0], c[1]), m(c[0] + B.corner, c[1]), m(c[0] + B.corner, c[1] + B.corner), m(c[0], c[1] + B.corner)], 'w3');
  });
  // Interior steel columns.
  for (let i = 1; i < B.nb; i++) {
    const g = grids[i];
    const sq = [m(g - 0.6, B.colY - 0.6), m(g + 0.6, B.colY - 0.6), m(g + 0.6, B.colY + 0.6), m(g - 0.6, B.colY + 0.6)];
    s.hatch('steel', sq, 'ink', true);
  }
  // Stairs at the west and east ends, in the north bays.
  [[B.wall, B.wall + 10], [B.L - B.wall - 10, B.L - B.wall]].forEach(function (xx) {
    const y0 = B.W - B.wall - 12.5, y1 = B.W - B.wall;
    s.poly([m(xx[0], y0), m(xx[1], y0), m(xx[1], y1), m(xx[0], y1)], 'w2');
    s.line([m(xx[0] + 1.5, (y0 + y1) / 2), m(xx[1] - 1.5, (y0 + y1) / 2)], 'w2');
    for (let x = xx[0] + 1.5; x <= xx[1] - 1.5 + 1e-6; x += 0.875) s.line([m(x, y0), m(x, y1)], 'w1');
  });
}

function planLabels(s, row, title, extra) {
  const m = plan(row);
  s.dim(m(0, -10), m(B.L, -10), [m(B.L / 2, -16)[0], m(B.L / 2, -16)[1]]);
  s.dim(m(0, -10), m(20, -10), [m(10, -13)[0], m(10, -13)[1]]);
  s.dim(m(B.L + 10, 0), m(B.L + 10, B.W), [m(B.L + 16, B.W / 2)[0], m(B.L + 16, B.W / 2)[1]]);
  northArrow(s, [m(B.L + 24, B.W)[0], m(B.L + 24, B.W)[1]], 90);
  s.note(title, [m(0, -22)[0], m(0, -22)[1]], 900, m(4, -2));
  (extra || []).forEach(function (n) { s.note(n.text, [m(n.at[0], n.at[1])[0], m(n.at[0], n.at[1])[1]], n.width || 220, m(n.tip[0], n.tip[1]), n.pen); });
}

function iter2() {
  const s = Sheet();
  planShell(s, 'f1', { bubbles: true, doors: true });
  planLabels(s, 'f1', 'ITERATION 2: STRUCTURAL GRID AND FIRST FLOOR PLAN (1/4"=1\'-0"). 10 bays at 20 ft (assumed) between brick piers; one line of steel columns on grid B; stairs at both ends; doors in the end walls (assumed). Use in the 2000s: shop and review space (assumed).', [
    { text: 'Shop / review space (assumed). Open floor, steel columns at 20 ft.', at: [60, 44], tip: [70, 30], width: 300 },
    { text: 'West stair (assumed position)', at: [14, 46], tip: [6, 44], width: 160 },
    { text: 'East stair (removed in the 2017-19 renovation)', at: [150, 46], tip: [193, 44], width: 200 },
    { text: 'Brick pier, 2\'-6" (assumed)', at: [86, 10], tip: [80, 1], width: 160, pen: 'orange' },
    { text: 'Steel sash, full bay between piers', at: [112, 10], tip: [110, 0.75], width: 190, pen: 'blue' },
    { text: 'Entry, pair of doors (assumed)', at: [-34, 16], tip: [0, 13], width: 160 }
  ]);
  return s;
}

function iter3() {
  const s = Sheet();
  planShell(s, 'f3', { bubbles: false, doors: false });
  const m = plan('f3');
  // Studio desks: four rows, four desks a bay, clear of the stair bays.
  for (let i = 0; i < B.nb; i++) {
    const g = grids[i];
    const rows = (i === 0 || i === B.nb - 1) ? [4, 11] : [4, 11, 36, 43];
    rows.forEach(function (y) {
      for (let k = 0; k < 4; k++) {
        const x = g + 2 + k * 4.25;
        s.poly([m(x, y), m(x + 3, y), m(x + 3, y + 5), m(x, y + 5)], 'w1');
      }
    });
  }
  // A pin-up wall down grid B, between the columns.
  s.line([m(22, B.colY), m(178, B.colY)], 'w3', 'grey');
  planLabels(s, 'f3', 'ITERATION 3: THIRD FLOOR, ARCHITECTURE STUDIOS (1/4"=1\'-0"). Open studio floor under the sawtooth roof; desks drawn schematic, about 140 places; pin-up wall on grid B (assumed).', [
    { text: 'Studio desks, 3 x 5 ft, four to a bay (schematic)', at: [40, 32], tip: [43, 16], width: 220 },
    { text: 'Pin-up / crit wall between the columns (assumed)', at: [92, 33], tip: [100, 26], width: 220, pen: 'grey' },
    { text: 'Third floor and roof removed in the 2017-19 renovation (Ochshorn)', at: [120, -3], tip: [130, 4], width: 260, pen: 'red' }
  ]);
  return s;
}

function iter4() {
  const s = Sheet();
  const m = plan('roof');
  s.poly([m(0, 0), m(B.L, 0), m(B.L, B.W), m(0, B.W)], 'w3');
  s.poly([m(1, 1), m(B.L - 1, 1), m(B.L - 1, B.W - 1), m(1, B.W - 1)], 'w1');
  for (let k = 1; k <= B.teeth; k++) {
    const y = 1 + k * toothLen;
    s.line([m(1, y), m(B.L - 1, y)], 'w3');
    if (k < B.teeth) s.line([m(1, y + 0.8), m(B.L - 1, y + 0.8)], 'w2', 'blue');
    else s.line([m(1, y - 0.8), m(B.L - 1, y - 0.8)], 'w2', 'blue');
    // Slope arrows on each tooth.
    [40, 100, 160].forEach(function (x) {
      const y0 = y - toothLen + 2, y1 = y - 2;
      s.line([m(x, y0), m(x, y1)], 'w1');
      s.line([m(x - 0.8, y1 - 1.6), m(x, y1), m(x + 0.8, y1 - 1.6)], 'w1');
    });
    for (let i = 1; i < B.nb; i++) s.line([m(grids[i], y - toothLen), m(grids[i], y)], 'w1', 'grey');
  }
  // Section line for the cross section.
  s.line([m(100, -8), m(100, B.W + 8)], 'w3', 'red');
  s.note('A', [m(100, -12)[0] - 6, m(100, -12)[1] - 8], 14, m(100, -8), 'red');
  s.note('A', [m(100, B.W + 14)[0] - 6, m(100, B.W + 14)[1] - 8], 14, m(100, B.W + 8), 'red');
  northArrow(s, [m(B.L + 24, B.W)[0], m(B.L + 24, B.W)[1]], 90);
  s.dim(m(0, -10), m(B.L, -10), [m(B.L / 2, -16)[0], m(B.L / 2, -16)[1]]);
  s.dim(m(B.L + 10, 1), m(B.L + 10, 1 + toothLen), [m(B.L + 16, 7)[0], m(B.L + 16, 7)[1]]);
  s.note('ITERATION 4: ROOF PLAN (1/4"=1\'-0"). Sawtooth roof inside a brick parapet: four teeth of about 12\'-6", ridges running east-west, vertical glazing facing north (count, pitch and direction assumed; Architectural Record confirms a sawtooth). Section A cuts mid-bay.',
    [m(0, -22)[0], m(0, -22)[1]], 900, m(4, 0));
  s.note('North-facing glazing at each ridge', [m(60, B.W + 8)[0], m(60, B.W + 8)[1] - 20], 200, m(60, 1 + 3 * toothLen + 0.8), 'blue');
  s.note('Roof slopes up to the north on each tooth', [m(112, B.W + 8)[0], m(112, B.W + 8)[1] - 20], 200, m(100, 1 + 2 * toothLen - 3));
  return s;
}

// ---------------------------------------------------------------------------------------------------------------
// Elevations
// ---------------------------------------------------------------------------------------------------------------

function levelMarks(s, map, len, right) {
  const marks = [['Grade 0\'-0"', 0], ['1st floor +1\'-6"', B.F[0]], ['2nd floor +15\'-6"', B.F[1]], ['3rd floor +28\'-6"', B.F[2]], ['Roof bearing +40\'-0"', B.roof], ['Top of parapet +43\'-0"', B.parapet]];
  marks.forEach(function (mk) {
    const a = map(right ? len + 2 : -2, mk[1]), b = map(right ? len + 8 : -8, mk[1]);
    s.line([a, b], 'w1', 'grey');
    // Labels go outward from the building, whichever way the view is mirrored.
    const at = b[0] > a[0] ? [b[0] + 4, b[1] - 10] : [b[0] - 126 * WS - 4, b[1] - 10];
    s.note(mk[0] + ' (assumed)', at, 126, b, 'grey');
  });
}

// The first pass: outline, floors and openings as plain boxes.
function iter5() {
  const s = Sheet();
  const m = southEl;
  s.line([m(-20, 0), m(B.L + 20, 0)], 'w4');
  s.poly([m(0, 0), m(B.L, 0), m(B.L, B.parapet), m(0, B.parapet)], 'w3');
  B.F.slice(1).forEach(function (f) { s.line([m(0, f), m(B.L, f)], 'w1', 'grey'); });
  s.line([m(0, B.roof), m(B.L, B.roof)], 'w1', 'grey');
  southOpenings.forEach(function (o) {
    for (let f = 0; f < 3; f++) s.poly(rectOn(m, o[0], B.sills[f], o[1], B.heads[f]), 'w2', 'blue');
  });
  s.dim(m(0, -6), m(B.L, -6), m(B.L / 2, -10));
  s.dim(m(B.L + 6, 0), m(B.L + 6, B.parapet), m(B.L + 12, 20));
  s.note('ITERATION 5: SOUTH ELEVATION, FIRST PASS (1/4"=1\'-0"). Massing only: 200 ft long, ~43 ft to the parapet, three floors, ten full-bay openings a floor. Faces Sibley Hall across the service gap.',
    m(0, -14), 900, m(10, 0));
  return s;
}

// The sash in one opening: units divided by mullions, panes by muntins, an opening vent in the middle unit.
function sash(s, map, a, b, z0, z1, units, cols, paneH) {
  s.poly(rectOn(map, a, z0, b, z1), 'w2', 'blue');
  const uw = (b - a) / units;
  for (let u = 1; u < units; u++) s.line([map(a + u * uw, z0), map(a + u * uw, z1)], 'w2', 'blue');
  for (let u = 0; u < units; u++) {
    for (let c = 1; c < cols; c++) { const x = a + u * uw + c * uw / cols; s.line([map(x, z0), map(x, z1)], 'w1', 'blue'); }
  }
  const rows = Math.max(2, Math.round((z1 - z0) / paneH));
  for (let k = 1; k < rows; k++) { const z = z0 + k * (z1 - z0) / rows; s.line([map(a, z), map(b, z)], 'w1', 'blue'); }
  // A pivoting vent in the middle unit, two panes high.
  const mid = Math.floor(units / 2);
  const vz0 = z0 + Math.floor(rows / 2) * (z1 - z0) / rows, vz1 = vz0 + 2 * (z1 - z0) / rows;
  if (vz1 <= z1 + 1e-6) s.poly(rectOn(map, a + mid * uw + 0.3, vz0 + 0.2, a + (mid + 1) * uw - 0.3, vz1 - 0.2), 'w2', 'blue');
}

// A long facade at full detail: piers, stone bands, brick spandrels, sash. map is southEl or northEl.
function facade(s, map, opt) {
  const L = B.L;
  s.line([map(-20, 0), map(L + 20, 0)], 'w4');
  // Brick spandrels and parapet (yellow brick).
  const bands = [[0, B.sills[0]], [B.heads[0], B.sills[1]], [B.heads[1], B.sills[2]], [B.heads[2], B.parapet]];
  bands.forEach(function (bd) { s.hatch('brick', rectOn(map, 0, bd[0], L, bd[1]), 'orange', false); });
  // Piers, full height.
  grids.forEach(function (g) {
    let a = g - B.pier / 2, b = g + B.pier / 2;
    if (g === 0) { a = 0; b = B.corner; }
    if (g === L) { a = L - B.corner; b = L; }
    s.hatch('brick', rectOn(map, a, 0, b, B.parapet), 'orange', false);
    s.line([map(a, 0), map(a, B.parapet)], 'w2');
    s.line([map(b, 0), map(b, B.parapet)], 'w2');
  });
  s.poly(rectOn(map, 0, 0, L, B.parapet), 'w3');
  // Stone: water table, sill bands, cornice band, coping.
  s.poly(rectOn(map, -0.3, 2.4, L + 0.3, 3), 'w2', 'grey');
  B.sills.forEach(function (z) { s.poly(rectOn(map, -0.2, z - 0.6, L + 0.2, z), 'w2', 'grey'); });
  s.poly(rectOn(map, -0.6, B.roof, L + 0.6, B.roof + 1.4), 'w3', 'grey');
  s.poly(rectOn(map, -0.3, B.parapet - 0.4, L + 0.3, B.parapet), 'w2', 'grey');
  // Sash.
  southOpenings.forEach(function (o) {
    for (let f = 0; f < 3; f++) sash(s, map, o[0], o[1], B.sills[f], B.heads[f], opt.units, opt.cols, opt.paneH);
  });
  // Sawtooth ridge seen over the parapet.
  if (opt.ridge) s.line([map(1, B.parapet), map(1, B.peak), map(L - 1, B.peak), map(L - 1, B.parapet)], 'w1', 'grey');
}

function iter6() {
  const s = Sheet();
  facade(s, southEl, { units: 3, cols: 4, paneH: 1.5, ridge: true });
  const m = southEl;
  levelMarks(s, m, B.L, true);
  s.dim(m(80, -3), m(100, -3), m(90, -4.5));
  s.note('Yellow brick piers and spandrels', m(22, 52), 170, m(21, 15), 'orange');
  s.note('Steel daylight-factory sash: three units an opening, panes about 1\'-6" x 1\'-6", a pivoting vent in the middle unit (pane count assumed)', m(46, 54), 300, m(50, 22), 'blue');
  s.note('Light stone: water table, sill bands, cornice band, coping', m(112, 52), 230, m(120, 40.7), 'grey');
  s.note('Sawtooth ridge just over the parapet (assumed)', m(160, 52), 180, m(170, B.peak), 'grey');
  s.note('ITERATION 6: SOUTH ELEVATION, SECOND PASS (1/4"=1\'-0"). Piers, stone bands, brick spandrels and the steel sash drawn. This is the face chosen for the isometric.',
    m(0, -19), 900, m(14, 0));
  return s;
}

function iter7() {
  const s = Sheet();
  // East elevation.
  const e = eastEl;
  s.line([e(-12, 0), e(B.W + 12, 0)], 'w4');
  [[0, B.sills[0]], [B.heads[0], B.sills[1]], [B.heads[1], B.sills[2]], [B.heads[2], B.parapet]].forEach(function (bd) {
    s.hatch('brick', rectOn(e, 0, bd[0], B.W, bd[1]), 'orange', false);
  });
  endGrids.forEach(function (g) {
    let a = g - B.pier / 2, b = g + B.pier / 2;
    if (g === 0) { a = 0; b = B.corner; }
    if (g === B.W) { a = B.W - B.corner; b = B.W; }
    s.hatch('brick', rectOn(e, a, 0, b, B.parapet), 'orange', false);
    s.line([e(a, 0), e(a, B.parapet)], 'w2');
    s.line([e(b, 0), e(b, B.parapet)], 'w2');
  });
  s.poly(rectOn(e, 0, 0, B.W, B.parapet), 'w3');
  s.poly(rectOn(e, -0.3, 2.4, B.W + 0.3, 3), 'w2', 'grey');
  B.sills.forEach(function (z) { s.poly(rectOn(e, -0.2, z - 0.6, B.W + 0.2, z), 'w2', 'grey'); });
  s.poly(rectOn(e, -0.6, B.roof, B.W + 0.6, B.roof + 1.4), 'w3', 'grey');
  s.poly(rectOn(e, -0.3, B.parapet - 0.4, B.W + 0.3, B.parapet), 'w2', 'grey');
  endOpenings.forEach(function (o, i) {
    for (let f = 0; f < 3; f++) {
      if (f === 0 && i === 0) {
        const c = (o[0] + o[1]) / 2;
        s.poly(rectOn(e, c - 3, B.F[0], c + 3, 10), 'w3');
        s.line([e(c, B.F[0]), e(c, 10)], 'w2');
        sash(s, e, o[0], o[1], 10.6, B.heads[0], 3, 4, 1.5);
        s.poly(rectOn(e, c - 4, 0, c + 4, B.F[0]), 'w2', 'grey');
      } else sash(s, e, o[0], o[1], B.sills[f], B.heads[f], 3, 4, 1.5);
    }
  });
  // Sawtooth profile over the parapet.
  for (let k = 0; k < B.teeth; k++) {
    const y0 = 1 + k * toothLen, y1 = y0 + toothLen;
    const yAt43 = y0 + toothLen * (B.parapet - B.roof) / (B.peak - B.roof);
    s.line([e(yAt43, B.parapet), e(y1, B.peak), e(y1, B.parapet)], 'w2');
  }
  s.dim(e(0, -6), e(B.W, -6), e(B.W / 2, -10));
  s.note('EAST ELEVATION (1/4"=1\'-0"). Three openings wide on two piers and a centre pier; entry doors in the south bay (assumed); the sawtooth profile shows over the parapet.', e(0, -14), 560, e(10, 0));
  s.note('Sawtooth ends, glass facing north (to the right)', e(2, 54), 230, e(1 + toothLen, B.peak));
  s.note('Entry (assumed)', e(-26, 14), 110, e(8, 6));

  // Cross section A, looking west.
  const x = sect;
  s.line([x(-14, 0), x(B.W + 14, 0)], 'w4');
  s.hatch('earth', [x(-14, 0), x(0, 0), x(0, -6), x(-14, -6)], 'green', false);
  s.hatch('earth', [x(B.W, 0), x(B.W + 14, 0), x(B.W + 14, -6), x(B.W, -6)], 'green', false);
  s.hatch('concrete', [x(-1, -6), x(B.wall + 1, -6), x(B.wall + 1, -5), x(-1, -5)], 'ink', true);
  s.hatch('concrete', [x(B.W - B.wall - 1, -6), x(B.W + 1, -6), x(B.W + 1, -5), x(B.W - B.wall - 1, -5)], 'ink', true);
  [[0, B.wall], [B.W - B.wall, B.W]].forEach(function (w) {
    s.hatch('concrete', rectOn(x, w[0], -5, w[1], 0), 'ink', true);
    [[0, B.sills[0]], [B.heads[0], B.sills[1]], [B.heads[1], B.sills[2]], [B.heads[2], B.parapet]].forEach(function (bd) {
      s.hatch('brick', rectOn(x, w[0], bd[0], w[1], bd[1]), 'orange', true);
    });
    for (let f = 0; f < 3; f++) s.line([x((w[0] + w[1]) / 2, B.sills[f]), x((w[0] + w[1]) / 2, B.heads[f])], 'w3', 'blue');
  });
  // Floors: slab on grade, then concrete slabs on steel beams.
  s.hatch('concrete', rectOn(x, B.wall, B.F[0] - 0.5, B.W - B.wall, B.F[0]), 'ink', true);
  [B.F[1], B.F[2]].forEach(function (f) {
    s.hatch('concrete', rectOn(x, B.wall, f - 0.6, B.W - B.wall, f), 'ink', true);
    s.hatch('steel', rectOn(x, B.colY - 0.6, f - 2.2, B.colY + 0.6, f - 0.6), 'ink', true);
  });
  // Column on grid B.
  s.poly(rectOn(x, B.colY - 0.5, B.F[0], B.colY + 0.5, B.roof), 'w2');
  // Sawtooth roof.
  const prof = [];
  for (let k = 0; k < B.teeth; k++) {
    const y0 = 1 + k * toothLen, y1 = y0 + toothLen;
    prof.push(x(Math.max(y0, B.wall), B.roof), x(y1 - 0.01, B.peak));
    if (k < B.teeth - 1) {
      s.line([x(y1, B.peak), x(y1, B.roof)], 'w3', 'blue');
      prof.push(x(y1, B.roof));
    }
  }
  s.line(prof, 'w3');
  // Roof trusses: a vertical at each peak.
  for (let k = 0; k < B.teeth - 1; k++) { const y1 = 1 + (k + 1) * toothLen; s.line([x(y1 - 0.6, B.roof), x(y1 - 0.6, B.peak - 0.3)], 'w1'); }
  s.note('3rd floor studio, lit from the north-facing sawtooth glass', x(8, 35), 240, x(20, 32));
  s.note('2nd floor studio', x(8, 21.5), 140, x(14, 20));
  s.note('1st floor shop / review (assumed)', x(8, 8), 170, x(14, 6));
  s.note('Steel column on grid B, steel beams under concrete slabs (sizes assumed)', x(29, 21.5), 220, x(B.colY, 13.6));
  s.note('Brick bearing piers and spandrels, steel sash', x(-34, 36), 140, x(0.7, 34));
  s.note('SECTION A, LOOKING WEST (1/4"=1\'-0"). The space Tschapeller later opened to a ~40 ft volume by taking out the third floor and roof.', x(0, -14), 560, x(10, 0));
  levelMarks(s, x, B.W, true);
  s.note('ITERATION 7: EAST ELEVATION AND CROSS SECTION A.', e(0, -24), 400, e(4, -14));
  return s;
}

// Branch 0.6: the north elevation, read another way.
function iter8() {
  const s = Sheet();
  facade(s, northEl, { units: 2, cols: 3, paneH: 2.25, ridge: false });
  const m = northEl;
  // The sawtooth glass faces north, so from this side the glazed monitors show over the parapet.
  s.poly([m(1, B.parapet), m(B.L - 1, B.parapet), m(B.L - 1, B.peak), m(1, B.peak)], 'w2', 'blue');
  for (let x = 5; x < B.L - 1; x += 5) s.line([m(x, B.parapet), m(x, B.peak)], 'w1', 'blue');
  s.dim(m(0, -6), m(B.L, -6), m(B.L / 2, -10));
  levelMarks(s, m, B.L, true);
  s.note('OPTION B: two sash units an opening with larger panes, about 2\'-3" high', northEl(150, 52), 230, northEl(150, 22), 'blue');
  s.note('Glazed sawtooth monitors face north, so they show on this side', northEl(70, 54), 230, northEl(60, 45), 'blue');
  s.note('ITERATION 8 (BRANCH FROM 6): NORTH ELEVATION, UNIVERSITY AVENUE SIDE, OPTION B (1/4"=1\'-0"). East on the left. A second reading of the sash: two larger units an opening instead of three. Compare with the south elevation; neither pane count is confirmed.',
    m(B.L, -14), 900, m(B.L - 10, 0));
  return s;
}

// ---------------------------------------------------------------------------------------------------------------
// Isometric, from the southeast
// ---------------------------------------------------------------------------------------------------------------
function isoBox(s) {
  const L = B.L, W = B.W, H = B.parapet;
  s.line([iso(-15, 0, 0), iso(L + 15, 0, 0)], 'w1', 'grey');
  s.line([iso(L, -15, 0), iso(L, W + 15, 0)], 'w1', 'grey');
  s.poly([iso(0, 0, 0), iso(L, 0, 0), iso(L, 0, H), iso(0, 0, H)], 'w3');
  s.poly([iso(L, 0, 0), iso(L, W, 0), iso(L, W, H), iso(L, 0, H)], 'w3');
  s.poly([iso(0, 0, H), iso(L, 0, H), iso(L, W, H), iso(0, W, H)], 'w3');
}

function iter9() {
  const s = Sheet();
  isoBox(s);
  [B.F[1], B.F[2], B.roof].forEach(function (z) {
    s.line([iso(0, 0, z), iso(B.L, 0, z), iso(B.L, B.W, z)], 'w1', 'grey');
  });
  grids.forEach(function (g) { s.line([iso(g, 0, 0), iso(g, 0, B.parapet)], 'w1', 'grey'); });
  endGrids.forEach(function (g) { s.line([iso(B.L, g, 0), iso(B.L, g, B.parapet)], 'w1', 'grey'); });
  for (let k = 1; k <= B.teeth; k++) {
    const y = 1 + k * toothLen;
    s.line([iso(1, y, B.peak), iso(B.L - 1, y, B.peak)], 'w2');
  }
  s.note('ITERATION 9 (BRANCH FROM 7): ISOMETRIC MASSING FROM THE SOUTHEAST. The chosen view puts the south elevation (iteration 6) and the east elevation (iteration 7) together. Box, floors, bays and the sawtooth ridges.',
    [ISO.x, ISO.y + 1350], 800, iso(10, 0, 0));
  return s;
}

function iter10() {
  const s = Sheet();
  const L = B.L, W = B.W;
  const south = function (X, Z) { return iso(X, 0, Z); };
  const east = function (Y, Z) { return iso(L, Y, Z); };
  // Piers.
  grids.forEach(function (g) {
    let a = g - B.pier / 2, b = g + B.pier / 2;
    if (g === 0) { a = 0; b = B.corner; }
    if (g === L) { a = L - B.corner; b = L; }
    s.line([south(a, 0), south(a, B.parapet)], 'w2');
    s.line([south(b, 0), south(b, B.parapet)], 'w2');
  });
  endGrids.forEach(function (g) {
    let a = g - B.pier / 2, b = g + B.pier / 2;
    if (g === 0) { a = 0; b = B.corner; }
    if (g === W) { a = W - B.corner; b = W; }
    s.line([east(a, 0), east(a, B.parapet)], 'w2');
    s.line([east(b, 0), east(b, B.parapet)], 'w2');
  });
  // Stone bands, wrapping the corner.
  [2.7, B.sills[0], B.sills[1], B.sills[2], B.roof, B.roof + 1.4, B.parapet - 0.4].forEach(function (z, i) {
    s.line([iso(0, 0, z), iso(L, 0, z), iso(L, W, z)], i === 4 || i === 5 ? 'w3' : 'w1', 'grey');
  });
  // Sash on both faces.
  southOpenings.forEach(function (o) {
    for (let f = 0; f < 3; f++) sash(s, south, o[0], o[1], B.sills[f], B.heads[f], 3, 2, 3);
  });
  endOpenings.forEach(function (o, i) {
    for (let f = 0; f < 3; f++) {
      if (f === 0 && i === 0) {
        const c = (o[0] + o[1]) / 2;
        s.poly(rectOn(east, c - 3, B.F[0], c + 3, 10), 'w3');
        s.line([east(c, B.F[0]), east(c, 10)], 'w2');
        sash(s, east, o[0], o[1], 10.6, B.heads[0], 3, 2, 3);
      } else sash(s, east, o[0], o[1], B.sills[f], B.heads[f], 3, 2, 3);
    }
  });
  // Parapet inside line.
  s.line([iso(1, 1, B.parapet), iso(L - 1, 1, B.parapet), iso(L - 1, W - 1, B.parapet)], 'w1');
  // Sawtooth: ridges, the sloped backs, and the east-end triangles.
  for (let k = 0; k < B.teeth; k++) {
    const y0 = 1 + k * toothLen, y1 = y0 + toothLen;
    const ya = y0 + toothLen * (B.parapet - B.roof) / (B.peak - B.roof);
    s.line([iso(L - 1, ya, B.parapet), iso(L - 1, y1, B.peak), iso(L - 1, y1, B.parapet)], 'w2');
    s.line([iso(1, ya, B.parapet), iso(1, y1, B.peak), iso(1, y1, B.parapet)], 'w1');
    s.line([iso(1, y1, B.peak), iso(L - 1, y1, B.peak)], 'w3');
    s.line([iso(1, ya, B.parapet), iso(L - 1, ya, B.parapet)], 'w1', 'grey');
    for (let g = 20; g < L; g += 20) s.line([iso(g, ya, B.parapet), iso(g, y1, B.peak)], 'w1', 'grey');
  }
  s.note('Yellow brick piers, light stone bands wrapping the corner', iso(-40, 0, 56), 230, iso(40, 0, B.sills[2]), 'grey');
  s.note('Steel daylight-factory sash, three units a bay', iso(70, 0, 70), 230, iso(70, 0, 24));
  s.note('Sawtooth roof, four teeth, glass facing north (assumed)', iso(150, 26, 78), 230, iso(150, 26, B.peak));
  s.note('East entry (assumed)', iso(L + 30, 0, -4), 130, east(10, 6));
  s.note('ITERATION 10 (FINAL): ISOMETRIC FROM THE SOUTHEAST, DETAILED. Piers, stone bands, sash with a pivoting vent, the east entry and the sawtooth roof. AI draft from published descriptions; verify against archive drawings and photos before use.',
    [ISO.x, ISO.y + 1500], 800, iso(30, 0, 0));
  return s;
}

// ---------------------------------------------------------------------------------------------------------------
// The iterations, the lane they belong to, and what was "said" in each scene (shown as the scene's words).
// ---------------------------------------------------------------------------------------------------------------
const ITERS = [
  { n: 1, lane: 'main', file: 'site-footprint', fn: iter1, said: 'Iteration 1. Site and footprint from the research: north-east corner of the Arts Quad, behind Sibley, on University Avenue, the Foundry to the west, the gap that later became Milstein Hall.' },
  { n: 2, lane: 'main', file: 'first-floor-grid', fn: iter2, said: 'Iteration 2. Structural grid and first floor: ten bays of twenty feet, brick piers, one line of steel columns, stairs at both ends.' },
  { n: 3, lane: 'main', file: 'third-floor-studios', fn: iter3, said: 'Iteration 3. Third floor architecture studios: open floor of desks under the sawtooth, a pin-up wall down the middle.' },
  { n: 4, lane: 'main', file: 'roof-plan', fn: iter4, said: 'Iteration 4. Roof plan: four sawtooth teeth with north light, and the section line A.' },
  { n: 5, lane: 'main', file: 'south-elevation-v1', fn: iter5, said: 'Iteration 5. South elevation first pass: massing, floors and openings only.' },
  { n: 6, lane: 'main', file: 'south-elevation-v2', fn: iter6, said: 'Iteration 6. South elevation second pass: piers, stone bands, yellow brick and the steel sash. This is the face chosen for the isometric.' },
  { n: 7, lane: 'main', file: 'east-elevation-section', fn: iter7, said: 'Iteration 7. East elevation with the entry, and cross section A looking west through the three floors and the sawtooth.' },
  { n: 8, lane: 'north', file: 'north-elevation-option-b', fn: iter8, said: 'Iteration 8, a branch from 6. North elevation on University Avenue, option B with two larger sash units a bay.' },
  { n: 9, lane: 'iso', file: 'isometric-massing', fn: iter9, said: 'Iteration 9, a branch from 7. Isometric massing from the south-east, the chosen view.' },
  { n: 10, lane: 'iso', file: 'isometric-detailed', fn: iter10, said: 'Iteration 10, final. Detailed isometric: piers, bands, sash, entry and the sawtooth roof.' }
];

const NAME = 'Rand Hall, Cornell, c. 2005: plans, elevations, isometric (AI draft)';
const TAGS = ['AI', 'draft', 'Rand Hall', 'Cornell', 'plan', 'elevation', 'isometric'];
const T0 = Date.parse('2026-11-05T17:00:00Z');
const LANES = {
  main: { id: 'ai-draft-rand-hall', name: NAME, parentId: null, fork: null, created: T0 },
  north: { id: 'ai-draft-rand-hall-north', name: 'Rand Hall: north elevation, option B (AI draft)', parentId: 'ai-draft-rand-hall', fork: { step: 6 }, created: T0 + 1 },
  iso: { id: 'ai-draft-rand-hall-iso', name: 'Rand Hall: isometric from the southeast (AI draft)', parentId: 'ai-draft-rand-hall', fork: { step: 7 }, created: T0 + 2 }
};

// The sheet items for one iteration, with ids that stay unique across the whole tree.
function buildIter(it) {
  const spec = { text_scale: TEXT_SCALE, name: 'Rand Hall iteration ' + it.n + ': ' + it.file.replace(/-/g, ' ') + ' (AI draft)', scale: SCALE, ai_inferred: true, tags: TAGS.concat(['iteration ' + it.n]), items: it.fn().items };
  const made = SK.authorDetail(spec);
  made.items.forEach(function (x) {
    if (x.kind === 'note' || x.kind === 'dim') x.size = SK.PAPER.text * TEXT_SCALE;
    x.id = 'i' + it.n + '-' + x.id;
    if (x.leaders) x.leaders.forEach(function (l, k) { l.id = x.id + 'l' + k; });
  });
  return { spec: spec, items: made.items };
}

// Timing: each stroke is drawn live, point by point, so the viewer replays it line by line.
function animate(items, start, budget) {
  const per = Math.max(30, Math.floor(budget / items.length));
  const events = [];
  let t = start;
  items.forEach(function (x) {
    if (x.kind === 'stroke') {
      const pts = [];
      let len = 0;
      x.pts.forEach(function (p, i) {
        if (i) len += Math.hypot(p[0] - x.pts[i - 1][0], p[1] - x.pts[i - 1][1]);
        pts.push(len);
      });
      const dur = Math.max(per * 0.8, 10);
      x.t0 = t;
      x.pts = x.pts.map(function (p, i) { return [p[0], p[1], 0.5, Math.round(len ? dur * pts[i] / len : 0)]; });
      events.push({ t: t, type: 'put', item: x, anim: true });
    } else {
      events.push({ t: t, type: 'put', item: x });
    }
    t += per;
  });
  return { events: events, end: t };
}

function main() {
  const specDir = path.join(ROOT, 'docs', 'examples', 'rand-hall');
  const outDir = path.join(ROOT, 'docs', 'rand-hall');
  fs.mkdirSync(specDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  const built = ITERS.map(function (it) {
    const b = buildIter(it);
    const file = 'iter-' + String(it.n).padStart(2, '0') + '-' + it.file + '.json';
    fs.writeFileSync(path.join(specDir, file), JSON.stringify(b.spec, null, 1) + '\n');
    return Object.assign({ specFile: file }, it, b);
  });

  // One recording per lane. Its base is the parent lane's sheet at the fork; each iteration is one scene.
  const sessions = [];
  const endState = {};
  ['main', 'north', 'iso'].forEach(function (key, li) {
    const lane = LANES[key];
    let base = [];
    if (lane.parentId) {
      const parentKey = Object.keys(LANES).filter(function (k) { return LANES[k].id === lane.parentId; })[0];
      base = endState[parentKey + ':' + lane.fork.step].slice();
    }
    const mine = built.filter(function (b) { return b.lane === key; });
    const events = [], speech = [];
    let t = 500;
    let state = base.slice();
    let step = 0;
    mine.forEach(function (b, i) {
      if (i) { events.push({ t: t, type: 'mark' }); }
      speech.push({ t: t, text: b.said });
      const a = animate(b.items, t + 200, 16000);
      a.events.forEach(function (ev) { events.push(ev); });
      state = state.concat(b.items);
      step++;
      endState[key + ':' + step] = state.slice();
      t = a.end + 4500;                               // a quiet gap longer than SK.IDLE_MS closes the scene
    });
    sessions.push({
      id: 'ai-draft-rand-hall-r' + li, detailId: lane.id, created: T0 + 1000 * (li + 1), duration: t,
      scale: SCALE, base: base, events: events, speech: speech, voice: [], audioOffset: 0, notes: []
    });
    lane.items = state;
  });

  // Each scene's notes: the spec file it came from.
  sessions.forEach(function (s) {
    const scenes = SK.segment(s);
    const mine = built.filter(function (b) { return LANES[b.lane].id === s.detailId; });
    if (scenes.length !== mine.length) throw new Error('lane ' + s.detailId + ' has ' + scenes.length + ' scenes, expected ' + mine.length);
    scenes.forEach(function (m, i) {
      s.notes.push({ key: SK.sceneKey(s.id, m.start), text: 'Spec: docs/examples/rand-hall/' + mine[i].specFile + ' · ' + mine[i].items.length + ' items', at: T0 + 5000 });
    });
  });

  const details = Object.keys(LANES).map(function (k) {
    const l = LANES[k];
    return { id: l.id, name: l.name, scale: SCALE, tags: TAGS, items: l.items, parentId: l.parentId, fork: l.fork, created: l.created, modified: T0 + 9000, rating: 1, ai_inferred: true };
  });
  const bundle = { schema: 'quick-detail/history-1', exported: new Date(T0 + 10000).toISOString(), details: details, sessions: sessions.map(function (s) { return Object.assign({ hasAudio: false }, s); }) };
  fs.writeFileSync(path.join(outDir, 'history.json'), JSON.stringify(bundle));

  // The exported viewer: the page, its stylesheets and scripts, and the history, in one file (as Export HTML does).
  let html = fs.readFileSync(path.join(ROOT, 'viewer.html'), 'utf8');
  const json = JSON.stringify(bundle).replace(/<\//g, '<\\/');
  html = html.replace(/<script type="application\/json" id="bundle">[\s\S]*?<\/script>/, function () {
    return '<script type="application/json" id="bundle">' + json + '</script>';
  });
  html = html.replace(/<link rel="stylesheet" href="(sketch\/[^"]+)">|<script src="(sketch\/[^"]+)"><\/script>/g, function (m, css, js) {
    const t = fs.readFileSync(path.join(ROOT, css || js), 'utf8');
    if (css) return '<style>\n' + t.replace(/<\/style/gi, '<\\/style') + '\n</style>';
    return '<script>\n' + t.replace(/<\/script/gi, '<\\/script') + '\n</script>';
  });
  html = html.replace('<title>Edit history · Quick Detail</title>', '<title>Rand Hall Iterations</title>');
  fs.writeFileSync(path.join(outDir, 'rand-hall-history.html'), html);

  built.forEach(function (b) { console.log('iteration ' + b.n + ' (' + b.lane + '): ' + b.items.length + ' items · ' + b.specFile); });
  sessions.forEach(function (s) { console.log(s.detailId + ': ' + SK.segment(s).length + ' scenes, ' + Math.round(s.duration / 1000) + ' s'); });
}

main();
