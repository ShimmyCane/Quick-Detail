// Torrance Cultural Arts Center, site plan: an AI draft in 3 increments, for use as an architectural background.
//
//   node tools/torrance-cac.js
//
// Writes one drawing spec per increment (cumulative: increment 3 holds everything):
//   docs/examples/torrance-cac/increment-1-streets-boundary.json
//   docs/examples/torrance-cac/increment-2-buildings-curbs-parking.json
//   docs/examples/torrance-cac/increment-3-trees-legend.json
//
// Geometry is laid out in feet here and written in real inches (feet x 12), so the spec matches the canvas.
// Scale 1/4"=1'-0" (factor 48), the same as the Rand Hall sheet. Every position is an assumption: building
// footprints, lots, stall counts and tree positions are placeholders, and the streets are labelled "(verify)".
// Checked with SK.authorDetail in tools/torrance-cac-check.js, and drawn into the canvas with window.QuickDetail.draw.
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'docs', 'examples', 'torrance-cac');
const IN = 12; // real inches per foot
const FT = v => v * IN;

// --- site, in feet (north up, y down) ---
const STREETS = [
  { x: 0, y: 80, w: 1200, h: 40, label: 'TORRANCE BLVD (verify)', at: [600, 106] },
  { x: 0, y: 760, w: 1200, h: 40, label: 'CIVIC CENTER DR (verify)', at: [600, 786] },
  { x: 50, y: 0, w: 40, h: 900, label: 'MADRONA AVE (verify)', at: [70, 450] },
  { x: 1110, y: 0, w: 40, h: 900, label: 'CRENSHAW BLVD (verify)', at: [1130, 450] }
];
const PARCEL = { x: 130, y: 150, w: 940, h: 590 };
const BUILDINGS = [
  { name: 'CULTURAL ARTS CENTER', x: 300, y: 330, w: 320, h: 190 },
  { name: 'THEATRE WING', x: 620, y: 300, w: 160, h: 140 }
];
const PLAZA = { x: 440, y: 520, w: 120, h: 80 };
const LOTS = [
  { x: 170, y: 180, w: 600, h: 100 },   // north surface lot
  { x: 800, y: 560, w: 250, h: 180 }    // east surface lot
];
const TREES = [];
for (let x = 170; x <= 1040; x += 110) { TREES.push([x, 170]); TREES.push([x, 725]); }
TREES.push([720, 400], [760, 470], [260, 420], [260, 480], [1000, 500], [960, 640]);
const LEGEND = { x: 830, y: 200, w: 240, h: 210 };

// --- spec helpers, real inches ---
const rectItem = (r, weight, pen) => ({ kind: 'rect', x: FT(r.x), y: FT(r.y), w: FT(r.w), h: FT(r.h), weight, pen });
const lineItem = (pts, weight, pen) => ({ kind: 'line', pts: pts.map(p => [FT(p[0]), FT(p[1])]), weight, pen });
// A label is one line: its width grows with its text (about 70 real inches a character at this text size).
// Only the title passes a wrap width, so it reads as a block.
const noteItem = (text, at, tip, wrap) => ({ kind: 'note', text, at: [FT(at[0]), FT(at[1])], width: wrap || Math.max(300, text.length * 70), tip: [FT(tip[0]), FT(tip[1])], arrow: 'filled' });
const circle = (cx, cy, r, n = 16) => {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
};

// Stall striping: 9 ft x 18 ft stalls on both long sides of a lot, plus the aisle centerline.
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
  STREETS.forEach(s => items.push(noteItem(s.label, [s.at[0] - 40, s.at[1] - 20], [s.x + s.w / 2, s.y + s.h / 2])));
  items.push(noteItem('SITE BOUNDARY (approx.)', [PARCEL.x + 20, PARCEL.y - 30], [PARCEL.x + 60, PARCEL.y]));
  return items;
};

const layer2 = () => {
  const items = [];
  BUILDINGS.forEach(b => {
    items.push(rectItem({ x: b.x - 2, y: b.y - 2, w: b.w + 4, h: b.h + 4 }, 'w1', 'red')); // curb, 2 ft out
    items.push(rectItem(b, 'w3', 'ink'));
    items.push(noteItem(b.name, [b.x + b.w + 20, b.y - 20], [b.x + b.w * 0.85, b.y + b.h * 0.2]));
  });
  items.push(rectItem({ x: PLAZA.x - 2, y: PLAZA.y - 2, w: PLAZA.w + 4, h: PLAZA.h + 4 }, 'w1', 'red'));
  items.push(rectItem(PLAZA, 'w2', 'ink'));
  items.push(noteItem('PLAZA', [PLAZA.x + PLAZA.w + 20, PLAZA.y + 10], [PLAZA.x + PLAZA.w - 10, PLAZA.y + PLAZA.h / 2]));
  LOTS.forEach(l => {
    items.push(rectItem({ x: l.x - 2, y: l.y - 2, w: l.w + 4, h: l.h + 4 }, 'w1', 'red'));
    items.push(rectItem(l, 'w2', 'ink'));
    items.push(...stallItems(l));
  });
  items.push(noteItem('SURFACE PARKING, 9x18 FT STALLS', [LOTS[0].x + 40, LOTS[0].y - 40], [LOTS[0].x + 60, LOTS[0].y]));
  return items;
};

const layer3 = () => {
  const items = [];
  TREES.forEach(([x, y]) => items.push(lineItem(circle(x, y, 15), 'w1', 'green')));
  items.push(noteItem('MAJOR TREE (approx. canopy)', [850, 440], [1000, 500]));
  // North arrow and scale bar
  items.push(lineItem([[1000, 840], [1012, 800], [1000, 808], [988, 800], [1000, 840]], 'w2', 'ink'));
  items.push(lineItem([[60, 850], [160, 850]], 'w2', 'ink'));
  items.push(noteItem('100 FT', [60, 870], [100, 850]));
  // Legend box
  const L = LEGEND;
  items.push(rectItem(L, 'w2', 'ink'));
  const key = [
    'LEGEND',
    'RED: CURB, 2 FT OFFSET',
    'INK: BUILDING, LOT, STRIPE',
    'GREEN: MAJOR TREE',
    'BLUE: AISLE CENTERLINE'
  ];
  key.forEach((t, i) => items.push(noteItem(t, [L.x + 10, L.y + 10 + i * 40], [L.x + 4, L.y + 10 + i * 40 + 8])));
  return items;
};

const header = (n, title) => ({
  name: `Torrance Cultural Arts Center, site plan, increment ${n} of 3 (AI draft)`,
  scale: '1/4"=1\'-0"',
  ai_inferred: true,
  tags: ['AI', 'draft', 'site plan', 'Torrance', 'Cultural Arts Center', title],
  text_scale: { title: 24, note: 24, small: 16, dim: 16 },
  draft_note: 'Draft: verify before use. Schematic, not surveyed. Streets, footprints, lots and trees are placeholders.'
});

const titleNote = () => noteItem('TORRANCE CULTURAL ARTS CENTER, 3330 CIVIC CENTER DR. DRAFT: VERIFY BEFORE USE.', [40, 30], [40, 40], 2700);

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
