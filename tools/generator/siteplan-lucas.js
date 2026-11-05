// LA Lucas Museum (One Lucas Plaza, Exposition Park), site plan: an AI draft in 10 increments.
//
//   node tools/generator/siteplan-lucas.js
//
// Increments 1-5 are tier 1 (concept), 6-8 are tier 2 (schematic), 9-10 are tier 3 (design development).
// Writes one spec per increment, cumulative (increment 10 holds everything), to docs/examples/lucas-museum/.
//
// Geometry is laid out in feet (north up, y down) and written in real inches (feet x 12). Scale 1/4"=1'-0"
// (factor 48): the app has no 1/16" scale, and this is the smallest one in SK.SCALES. Known from public sources: about 11 acres, Exposition Blvd to the north,
// Figueroa St to the east. Everything else is a placeholder: parcel lines, street names, building footprint,
// setbacks, parking counts, trees, contours and utilities. Those are marked "(verify)" or "(placeholder)".
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', '..', 'docs', 'examples', 'lucas-museum');
const IN = 12;
const FT = v => v * IN;

// --- site, in feet. Parcel is 960 x 500 ft = 480,000 sq ft, about 11.0 acres (placeholder shape) ---
const PARCEL = { x: 0, y: 0, w: 960, h: 500 };
const STREETS = [
  { x: 0, y: -60, w: 960, h: 60, label: 'EXPOSITION BLVD (verify)', at: [380, -90] },
  { x: 960, y: -60, w: 60, h: 620, label: 'FIGUEROA ST (verify)', at: [1040, 250] },
  { x: -60, y: 0, w: 60, h: 500, label: 'LEIGHTON ST (verify)', at: [-240, 230] },
  { x: 0, y: 500, w: 960, h: 60, label: 'SOUTH STREET (placeholder)', at: [380, 575] }
];
const MUSEUM = { name: 'LUCAS MUSEUM (placeholder footprint)', x: 250, y: 120, w: 400, h: 220 };
const PLAZA = { x: 280, y: 340, w: 340, h: 90 };
const LOTS = [
  { x: 60, y: 300, w: 170, h: 160 },   // west surface lot (placeholder)
  { x: 700, y: 260, w: 200, h: 200 }   // east surface lot (placeholder)
];
const DRIVES = [
  { x: 120, y: 500, w: 40, h: 0 }      // placeholder access, not drawn as area
];
const SETBACK = 30; // ft, placeholder
const TREES = [];
for (let x = 40; x <= 920; x += 110) { TREES.push([x, 28]); TREES.push([x, 472]); }
TREES.push([720, 200], [880, 240], [40, 260], [930, 420]);
const CONTOURS = [
  // placeholder rings, not surveyed
  [[120, 60], [400, 40], [820, 80], [900, 300], [700, 460], [300, 470], [60, 330], [120, 60]],
  [[190, 110], [400, 90], [760, 130], [840, 300], [660, 420], [320, 430], [110, 320], [190, 110]],
  [[260, 160], [420, 140], [640, 180], [700, 300], [600, 370], [360, 380], [200, 300], [260, 160]]
];
const UTILITIES = [
  { pts: [[-60, 530], [1020, 530]], label: 'WATER MAIN (placeholder, survey needed)' },
  { pts: [[480, 560], [480, 620]], label: 'STORM DRAIN (placeholder)' }
];
const CONTROL_PTS = [[0, 0], [960, 0], [960, 500], [0, 500]];
const LEGEND = { x: 1080, y: 0, w: 260, h: 230 };

// --- spec helpers, real inches ---
const rectItem = (r, weight, pen) => ({ kind: 'rect', x: FT(r.x), y: FT(r.y), w: FT(r.w), h: FT(r.h), weight, pen });
const lineItem = (pts, weight, pen) => ({ kind: 'line', pts: pts.map(p => [FT(p[0]), FT(p[1])]), weight, pen });
const noteItem = (text, at, tip, wrap) => ({ kind: 'note', text, at: [FT(at[0]), FT(at[1])], width: wrap || Math.max(300, text.length * 70), tip: [FT(tip[0]), FT(tip[1])], arrow: 'filled' });
const circle = (cx, cy, r, n = 16) => {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
};
const cross = (x, y, s = 8) => [lineItem([[x - s, y], [x + s, y]], 'w1', 'ink'), lineItem([[x, y - s], [x, y + s]], 'w1', 'ink')];

// Stall striping for a lot: 9 x 18 ft stalls on both long sides, plus an aisle centerline.
function stallItems(lot) {
  const items = [], sw = 9, sl = 18, top = lot.y, bot = lot.y + lot.h;
  for (let x = lot.x; x + sw <= lot.x + lot.w + 0.01; x += sw) {
    items.push(lineItem([[x, top], [x, top + sl]], 'w1', 'ink'));
    items.push(lineItem([[x, bot], [x, bot - sl]], 'w1', 'ink'));
  }
  items.push(lineItem([[lot.x, top + sl], [lot.x + lot.w, top + sl]], 'w1', 'ink'));
  items.push(lineItem([[lot.x, bot - sl], [lot.x + lot.w, bot - sl]], 'w1', 'ink'));
  const cy = lot.y + lot.h / 2;
  items.push(lineItem([[lot.x, cy], [lot.x + lot.w, cy]], 'w1', 'blue'));
  return items;
}

// Tier 1 (increments 1-5)
const inc1 = () => {
  const items = STREETS.map(s => rectItem(s, 'w2', 'ink'));
  items.push(rectItem(PARCEL, 'w2', 'ink'));
  STREETS.forEach(s => items.push(noteItem(s.label, [s.at[0] - 40, s.at[1] - 20], [s.x + s.w / 2, s.y + s.h / 2])));
  items.push(noteItem('SITE BOUNDARY (about 11 acres, placeholder shape)', [PARCEL.x + 20, PARCEL.y - 110], [PARCEL.x + 60, PARCEL.y]));
  return items;
};
const inc2 = () => {
  const items = [];
  items.push(rectItem({ x: MUSEUM.x - 2, y: MUSEUM.y - 2, w: MUSEUM.w + 4, h: MUSEUM.h + 4 }, 'w1', 'red'));
  items.push(rectItem(MUSEUM, 'w3', 'ink'));
  items.push(noteItem(MUSEUM.name, [MUSEUM.x + MUSEUM.w + 20, MUSEUM.y - 20], [MUSEUM.x + MUSEUM.w * 0.85, MUSEUM.y + MUSEUM.h * 0.2]));
  return items;
};
const inc3 = () => {
  const items = [];
  items.push(rectItem({ x: PLAZA.x - 2, y: PLAZA.y - 2, w: PLAZA.w + 4, h: PLAZA.h + 4 }, 'w1', 'red'));
  items.push(rectItem(PLAZA, 'w2', 'ink'));
  items.push(noteItem('PLAZA (placeholder)', [PLAZA.x + PLAZA.w + 20, PLAZA.y + 10], [PLAZA.x + PLAZA.w - 10, PLAZA.y + PLAZA.h / 2]));
  return items;
};
const inc4 = () => {
  const items = [];
  items.push(lineItem([[480, 0], [480, 120]], 'w1', 'blue'));
  items.push(noteItem('MAIN ENTRY (placeholder, verify)', [500, 60], [482, 90]));
  return items;
};
const inc5 = () => {
  const items = [];
  // North arrow and scale bar (1/16"=1'-0" so 100 ft = 6.25 in paper)
  items.push(lineItem([[1000, 760], [1012, 720], [1000, 728], [988, 720], [1000, 760]], 'w2', 'ink'));
  items.push(noteItem('N', [1000, 780], [1000, 760]));
  items.push(lineItem([[60, 800], [160, 800]], 'w2', 'ink'));
  items.push(noteItem('100 FT', [60, 820], [100, 800]));
  return items;
};

// Tier 2 (increments 6-8)
const inc6 = () => {
  const items = [];
  const s = { x: PARCEL.x + SETBACK, y: PARCEL.y + SETBACK, w: PARCEL.w - 2 * SETBACK, h: PARCEL.h - 2 * SETBACK };
  items.push(rectItem(s, 'w1', 'blue'));
  items.push(noteItem(`SETBACK ${SETBACK} FT (placeholder, verify with code)`, [s.x + 20, s.y + 20], [s.x + 60, s.y]));
  return items;
};
const inc7 = () => {
  const items = [];
  LOTS.forEach(l => {
    items.push(rectItem({ x: l.x - 2, y: l.y - 2, w: l.w + 4, h: l.h + 4 }, 'w1', 'red'));
    items.push(rectItem(l, 'w2', 'ink'));
    items.push(...stallItems(l));
  });
  items.push(noteItem('SURFACE PARKING, 9x18 FT STALLS (count placeholder)', [LOTS[0].x + 20, LOTS[0].y - 40], [LOTS[0].x + 60, LOTS[0].y]));
  return items;
};
const inc8 = () => {
  const items = [];
  TREES.forEach(([x, y]) => items.push(lineItem(circle(x, y, 15), 'w1', 'green')));
  items.push(noteItem('TREE (approx. canopy, placeholder)', [740, 300], [720, 200]));
  return items;
};

// Tier 3 (increments 9-10)
const inc9 = () => {
  const items = [];
  CONTOURS.forEach(ring => items.push(lineItem(ring, 'w1', 'green')));
  items.push(noteItem('CONTOURS (placeholder, survey needed)', [880, 120], [820, 160]));
  return items;
};
const inc10 = () => {
  const items = [];
  UTILITIES.forEach(u => {
    items.push(lineItem(u.pts, 'w1', 'blue'));
    items.push(noteItem(u.label, [u.pts[0][0] + 20, u.pts[0][1] - 20], [u.pts[0][0] + 60, u.pts[0][1]]));
  });
  CONTROL_PTS.forEach(([x, y], i) => {
    cross(x, y).forEach(it => items.push(it));
    items.push(noteItem(`CP-${i + 1} (survey needed)`, [x + 20, y - 30], [x + 8, y]));
  });
  const L = LEGEND;
  items.push(rectItem(L, 'w2', 'ink'));
  const key = [
    'LEGEND (AI DRAFT)',
    'INK: PARCEL, STREETS, BUILDING',
    'RED: CURB OR OFFSET, 2 FT',
    'BLUE: SETBACK, UTILITY, AISLE',
    'GREEN: TREE, CONTOUR'
  ];
  key.forEach((t, i) => items.push(noteItem(t, [L.x + 10, L.y + 10 + i * 40], [L.x + 4, L.y + 10 + i * 40 + 8])));
  return items;
};

const titleNote = () => noteItem('LUCAS MUSEUM, ONE LUCAS PLAZA, EXPOSITION PARK, LOS ANGELES. DRAFT: VERIFY BEFORE USE.', [40, -160], [40, -140], 2700);

const header = (n, tier, title) => ({
  name: `LA Lucas Museum, site plan, increment ${n} of 10 (AI draft)`,
  scale: '1/4"=1\'-0"',
  ai_inferred: true,
  tags: ['AI', 'draft', 'site plan', 'Lucas Museum', 'Exposition Park', `tier ${tier}`, title],
  text_scale: { title: 24, note: 24, small: 16, dim: 16 },
  draft_note: 'Draft: verify before use. Schematic, not surveyed. Parcel shape, streets, footprint, parking, trees, contours and utilities are placeholders.'
});

// Each increment is cumulative: the same layers repeat, so every file stands alone.
const LAYERS = [inc1, inc2, inc3, inc4, inc5, inc6, inc7, inc8, inc9, inc10];
const TIER = [1, 1, 1, 1, 1, 2, 2, 2, 3, 3];
const TITLES = [
  'boundary and streets', 'museum footprint', 'plaza', 'entry', 'north arrow and scale',
  'setbacks', 'parking and access', 'trees', 'contours (placeholder)', 'utilities, control points and legend'
];

fs.mkdirSync(OUT, { recursive: true });
LAYERS.forEach((_, i) => {
  const items = [titleNote()];
  for (let k = 0; k <= i; k++) items.push(...LAYERS[k]());
  const spec = Object.assign(header(i + 1, TIER[i], TITLES[i]), { items });
  const file = `increment-${String(i + 1).padStart(2, '0')}-${TITLES[i].replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}.json`;
  fs.writeFileSync(path.join(OUT, file), JSON.stringify(spec, null, 1) + '\n');
  console.log('wrote', path.join(OUT, file), items.length, 'items');
});
