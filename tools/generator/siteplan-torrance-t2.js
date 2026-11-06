// Torrance Cultural Arts Center, site plan, tier 2 (schematic), AI draft in 3 increments, scale 1/16"=1'-0".
//
//   node tools/generator/siteplan-torrance-t2.js
//
// Writes one drawing spec per increment (cumulative: increment 3 holds everything):
//   docs/examples/torrance-cac-tier2/increment-1-streets-boundary.json
//   docs/examples/torrance-cac-tier2/increment-2-buildings-curbs-parking.json
//   docs/examples/torrance-cac-tier2/increment-3-trees-legend.json
//
// Layout comes from the OpenStreetMap tile check (z17, centred 33.8392 N, 118.3439 W): Civic Center Drive runs
// along the north edge, Torrance Boulevard along the south, Madrona Avenue on the west and Maple Avenue on the east.
// Coordinates are read off the tiles by eye, in feet, origin at the Madrona / Civic Center centreline, north up,
// y down. Everything is an estimate: the parcel is the campus block by map, and buildings, lots and trees are
// placeholders. No zoning, setbacks or easements are drawn (city and county sources were not reachable).
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', '..', 'docs', 'examples', 'torrance-cac-tier2');
const IN = 12; // real inches per foot
const FT = v => v * IN;

// --- site, in feet (north up, y down) ---
const STREETS = [
  { x: -40, y: -30, w: 1480, h: 60, label: 'CIVIC CENTER DR', at: [560, -78], tip: [560, -30] },
  { x: -40, y: 1110, w: 1480, h: 80, label: 'TORRANCE BLVD', at: [560, 1218], tip: [560, 1190] },
  { x: -40, y: -200, w: 80, h: 1450, label: 'MADRONA AVE', at: [-270, 420], tip: [-40, 420] },
  { x: 1361, y: -200, w: 80, h: 1450, label: 'MAPLE AVE', at: [1480, 420], tip: [1441, 420] }
];
const PARCEL = { x: 60, y: 60, w: 1280, h: 1030 }; // campus block, map estimate
const BUILDINGS = [
  { name: 'TORRANCE ART MUSEUM', x: 235, y: 81, w: 332, h: 259 },
  { name: 'CULTURAL ARTS CENTER', x: 110, y: 350, w: 190, h: 260 },
  { name: 'GEORGE NAKANO THEATRE', x: 305, y: 500, w: 121, h: 90 },
  { name: 'TORRANCE POLICE STATION', x: 605, y: 146, w: 210, h: 243 },
  { name: 'TORRANCE COURTHOUSE', x: 1080, y: 550, w: 165, h: 310 },
  { name: 'KATY GEISSERT LIBRARY', x: 380, y: 907, w: 163, h: 173 }
];
const LOTS = [
  { x: 880, y: 60, w: 420, h: 380 },  // north-east civic lot
  { x: 70, y: 400, w: 75, h: 300 },   // west lot on Madrona
  { x: 320, y: 640, w: 480, h: 200 }  // south lot
];
const TREES = [];
for (let x = 160; x <= 1340; x += 130) TREES.push([x, 60]);      // Civic Center frontage, approximate
for (let y = 200; y <= 1000; y += 150) TREES.push([90, y]);      // Madrona frontage, approximate
TREES.push([200, 200], [560, 380], [330, 470], [960, 500]);     // interior, approximate
const LEGEND = { x: 1500, y: 0, w: 360, h: 230 };

// --- spec helpers, real inches ---
const rectItem = (r, weight, pen) => ({ kind: 'rect', x: FT(r.x), y: FT(r.y), w: FT(r.w), h: FT(r.h), weight, pen });
const lineItem = (pts, weight, pen) => ({ kind: 'line', pts: pts.map(p => [FT(p[0]), FT(p[1])]), weight, pen });
// A label is one line: its width grows with its text (about 70 real inches a character at this text size).
// Only the title passes a wrap width, so it reads as a block.
const noteItem = (text, at, tip, wrap, cls = 'note') => ({ kind: 'note', text, at: [FT(at[0]), FT(at[1])], width: wrap || Math.max(300, text.length * 260), tip: [FT(tip[0]), FT(tip[1])], arrow: 'filled', text_class: cls });
const circle = (cx, cy, r, n = 16) => {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
};

// Stall striping: 9 ft x 18 ft stalls on the top and bottom edges of a lot, plus the aisle centreline.
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

const layer1 = () => {
  const items = STREETS.map(s => rectItem(s, 'w2', 'ink'));
  items.push(rectItem(PARCEL, 'w1', 'ink'));
  STREETS.forEach(s => items.push(noteItem(s.label, s.at, s.tip)));
  items.push(noteItem('CAMPUS BOUNDARY, ESTIMATE', [PARCEL.x + 20, PARCEL.y - 30], [PARCEL.x + 60, PARCEL.y]));
  return items;
};

const layer2 = () => {
  const items = [];
  BUILDINGS.forEach(b => {
    items.push(rectItem({ x: b.x - 2, y: b.y - 2, w: b.w + 4, h: b.h + 4 }, 'w1', 'red')); // curb, 2 ft out
    items.push(rectItem(b, 'w3', 'ink'));
    items.push(noteItem(b.name, [b.x + b.w + 20, b.y - 20], [b.x + b.w * 0.85, b.y + b.h * 0.2]));
  });
  LOTS.forEach(l => {
    items.push(rectItem({ x: l.x - 2, y: l.y - 2, w: l.w + 4, h: l.h + 4 }, 'w1', 'red'));
    items.push(rectItem(l, 'w2', 'ink'));
    items.push(...stallItems(l));
  });
  items.push(noteItem('SURFACE PARKING, 9x18 FT STALLS (PLACEHOLDER)', [330, 870], [400, 840], 5985));
  return items;
};

const layer3 = () => {
  const items = [];
  TREES.forEach(([x, y]) => items.push(lineItem(circle(x, y, 15), 'w1', 'green')));
  items.push(noteItem('TREE (APPROX.)', [880, 480], [960, 500]));
  // North arrow and scale bar, off the south-west corner of the campus
  items.push(lineItem([[1400, 1260], [1412, 1220], [1400, 1228], [1388, 1220], [1400, 1260]], 'w2', 'ink'));
  items.push(lineItem([[60, 1300], [260, 1300]], 'w2', 'ink'));
  items.push(noteItem('200 FT', [60, 1330], [120, 1300]));
  // Legend box
  const L = LEGEND;
  items.push(rectItem(L, 'w2', 'ink'));
  const key = [
    'LEGEND',
    'RED: CURB, 2 FT OFFSET',
    'INK: BUILDING, LOT, STRIPE',
    'GREEN: TREE (APPROX.)',
    'BLUE: AISLE CENTERLINE'
  ];
  key.forEach((t, i) => items.push(noteItem(t, [L.x + 10, L.y + 10 + i * 40], [L.x + 4, L.y + 10 + i * 40 + 8], 4200, 'small')));
  return items;
};

const header = (n, title) => ({
  name: `Torrance Cultural Arts Center, site plan, tier 2, increment ${n} of 3 (AI draft)`,
  scale: '1/16"=1\'-0"',
  ai_inferred: true,
  tags: ['AI', 'draft', 'site plan', 'Torrance', 'Cultural Arts Center', 'tier 2', title],
  text_scale: { title: 24, note: 24, small: 16, dim: 16 },
  draft_note: 'Draft: verify before use. Schematic from OpenStreetMap imagery, not surveyed. Parcel is a map estimate. Buildings, lots and trees are placeholders. No zoning, setbacks or easements shown.'
});

const titleNote = () => noteItem('TORRANCE CULTURAL ARTS CENTER, 3330 CIVIC CENTER DR. DRAFT: VERIFY BEFORE USE.', [40, -230], [40, -180], 12300, 'title');

const SPECS = [
  { file: 'increment-1-streets-boundary.json', title: 'streets and boundary', items: () => [titleNote(), ...layer1()] },
  { file: 'increment-2-buildings-curbs-parking.json', title: 'buildings, curbs and parking', items: () => [titleNote(), ...layer1(), ...layer2()] },
  { file: 'increment-3-trees-legend.json', title: 'trees and legend', items: () => [titleNote(), ...layer1(), ...layer2(), ...layer3()] }
];

fs.mkdirSync(OUT, { recursive: true });
SPECS.forEach((s, i) => {
  const spec = Object.assign(header(i + 1, s.title), { items: s.items() });
  fs.writeFileSync(path.join(OUT, s.file), JSON.stringify(spec, null, 1) + '\n');
  console.log('wrote', path.join(OUT, s.file), spec.items.length, 'items');
});
