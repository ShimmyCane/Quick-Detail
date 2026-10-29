// Earth hatch generator and metrics for ai_collab markup. Pure: runs in Node, emits drawing items and metrics.
// Each variant is a parameter set (see ../earth-variants.json). Run with: node earth-tile.js <params.json> [out.json]
//
// Geometry: a rectangle of W × H inches at (X0, y0). A lattice of cols × rows cells. Each cell holds one group of
// five parallel lines, horizontal or vertical by checker. Copies are drawn at ±W and ±H so the pattern wraps.
// Lines are clipped to the rectangle inset by `inset`, so no mark touches the outline.
'use strict';
const fs = require('fs');

const r3 = v => Math.round(v * 1000) / 1000;

function segments(p) {
  const { X0, y0, W, H, cols, rows, spacing, hLen, vLen, orientation, stagger, inset } = p;
  const PX = W / cols, PY = H / rows;
  const segs = [];
  const horizontalAt = (i, j) => {
    if (orientation === 'rows') return true;
    const parity = (i + j) % 2 === 0;
    return orientation === 'checker-flip' ? !parity : parity;
  };
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const horiz = horizontalAt(i, j);
    let cx = (i + 0.5) * PX, cy = (j + 0.5) * PY;
    if (stagger && j % 2) cx += PX / 2;
    const L = horiz ? hLen : vLen;
    for (let k = 0; k < 5; k++) {
      const o = (k - 2) * spacing;
      for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) {
        const x = cx + dx, y = cy + dy;
        segs.push(horiz ? [x - L / 2, y + o, x + L / 2, y + o] : [x + o, y - L / 2, x + o, y + L / 2]);
      }
    }
  }
  // Clip axis-aligned segments to the inset rectangle.
  const lo = inset, hiX = W - inset, hiY = H - inset;
  const out = [];
  for (const [ax, ay, bx, by] of segs) {
    if (ax === bx) {
      if (ax < lo || ax > hiX) continue;
      const a = Math.max(ay, lo), b = Math.min(by, hiY);
      if (b > a) out.push([ax, a, bx, b]);
    } else {
      if (ay < lo || ay > hiY) continue;
      const a = Math.max(ax, lo), b = Math.min(bx, hiX);
      if (b > a) out.push([a, ay, b, by]);
    }
  }
  return out.map(s => [r3(s[0] + X0), r3(s[1] + p.y0), r3(s[2] + X0), r3(s[3] + p.y0)]);
}

// Distance from point to nearest segment.
function nearest(x, y, segs) {
  let best = Infinity;
  for (const s of segs) {
    const abx = s[2] - s[0], aby = s[3] - s[1];
    const l2 = abx * abx + aby * aby || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - s[0]) * abx + (y - s[1]) * aby) / l2));
    const d = Math.hypot(x - s[0] - abx * t, y - s[1] - aby * t);
    if (d < best) best = d;
  }
  return best;
}

// Metrics: cover (ink share), gaps (largest and mean empty radius), and far-view white share, measured on a
// coarse grid blurred to ~0.5 in. White share is the fraction of the blurred area whose ink density falls below
// half the mean: the white channels a viewer sees from a distance.
function metrics(p, segs) {
  const { X0, y0, W, H, inset, weight } = p;
  const x0 = X0 + inset, x1 = X0 + W - inset, yA = y0 + inset, yB = y0 + H - inset;
  const area = (x1 - x0) * (yB - yA);
  let len = 0;
  for (const s of segs) len += Math.hypot(s[2] - s[0], s[3] - s[1]);
  const cover = len * weight / area;

  const step = 0.04, nx = Math.round((x1 - x0) / step), ny = Math.round((yB - yA) / step);
  const ink = Array.from({ length: ny }, () => new Float64Array(nx));
  let maxGap = 0, sumGap = 0, nGap = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + (i + 0.5) * step, y = yA + (j + 0.5) * step;
    const d = nearest(x, y, segs);
    ink[j][i] = d <= weight / 2 + 0.005 ? 1 : 0;
    if (d > maxGap) maxGap = d;
    sumGap += d; nGap++;
  }
  // Box blur, radius 6 cells (~0.24 in each side).
  const r = 6, blur = [];
  for (let j = 0; j < ny; j++) {
    const row = new Float64Array(nx);
    for (let i = 0; i < nx; i++) {
      let s = 0, c = 0;
      for (let jj = Math.max(0, j - r); jj <= Math.min(ny - 1, j + r); jj++)
        for (let ii = Math.max(0, i - r); ii <= Math.min(nx - 1, i + r); ii++) { s += ink[jj][ii]; c++; }
      row[i] = s / c;
    }
    blur.push(row);
  }
  let mean = 0, n = 0;
  for (const row of blur) for (const v of row) { mean += v; n++; }
  mean /= n;
  let white = 0, sq = 0;
  for (const row of blur) for (const v of row) { if (v < mean / 2) white++; sq += (v - mean) ** 2; }
  return {
    cover: +cover.toFixed(3),
    meanGap: +(sumGap / nGap).toFixed(3),
    maxGap: +maxGap.toFixed(3),
    farWhite: +(white / n).toFixed(3),
    farCV: +(Math.sqrt(sq / n) / mean).toFixed(3),
  };
}

function items(id, p, segs) {
  const note = (suffix, x, y, text, width) => ({ c: 'ink', id: `${id}-${suffix}`, kind: 'note', at: [x, y], size: 0.09375, text, width, height: null, justify: 'auto', leaders: [] });
  const { X0, y0, W, H } = p;
  const out = [note('title', X0, y0 - 0.45, `${p.title} (AI collab ${p.run})`, 4.9)];
  out.push({ c: 'ink', id: `${id}-outline`, kind: 'stroke', w: 0.08, t0: 0,
    pts: [[X0, y0, 0.5, 0], [X0 + W, y0, 0.5, 10], [X0 + W, y0 + H, 0.5, 20], [X0, y0 + H, 0.5, 30], [X0, y0, 0.5, 40]] });
  segs.forEach((s, n) => out.push({ c: 'ink', id: `${id}-s${n + 1}`, kind: 'stroke', w: p.weight, t0: 0,
    pts: [[s[0], s[1], 0.5, 0], [s[2], s[3], 0.5, 10]] }));
  out.push(note('label', X0, y0 + H + 0.35, p.label, 5.3));
  return out;
}

// Shared geometry for every variant in the family.
const BASE = { X0: 18.5, y0: 75, W: 5.4, H: 3.5, inset: 0.08, weight: 0.04, run: 7 };

function build(list) {
  return list.map(v => {
    const p = { ...BASE, ...v.params, title: v.title, label: v.label };
    const segs = segments(p);
    return { id: v.id, title: v.title, label: v.label, params: p, metrics: metrics(p, segs), items: items(`ai-collab-${p.run}-${v.id}`, p, segs) };
  });
}

module.exports = { segments, metrics, items, build, BASE };

if (require.main === module) {
  const list = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const result = build(list);
  const out = process.argv[3];
  if (out) fs.writeFileSync(out, JSON.stringify(result));
  for (const r of result) console.log(r.id, JSON.stringify(r.metrics), r.items.length);
}
