// Pattern for ai_draft_detail generators: a construction detail drawn in increments.
// Copy this file to tools/generator/<kind>.js for a new drawing, or call writeIncrements() from a new generator.
// Other kinds (siteplan, elevation, floor plan, isometric) get their own file here, as tools/generator/siteplan.js does.
//
//   const { writeIncrements } = require('./detail');
//   writeIncrements({ name: 'roof-curb-wood-framed', outDir: ..., scale: '3"=1\'-0"', increments: [...] });
//
// Each increment is a full, cumulative drawing: increment N holds every item from increments 1 to N.
// Every spec carries: name, scale, tags (including AI and draft), ai_inferred, text_scale, version, items.
// Every spec carries the "Draft: verify before use" note, and every note has a tip.
// Positions are real inches. Feet and inches are converted by the caller (feet x 12).
'use strict';
const fs = require('fs');
const path = require('path');

const DRAFT_NOTE = {
  kind: 'note',
  text: 'Draft: verify before use',
  tip: 'Shows that the AI drew this detail and that nothing here is checked against code or a product spec.'
};

// increments: array of { label, items: [...] }, where each items array is only the new items for that step.
function writeIncrements({ name, outDir, scale, textScale, increments }) {
  if (!name || !outDir || !scale || !Array.isArray(increments) || increments.length === 0) {
    throw new Error('writeIncrements needs name, outDir, scale and at least one increment');
  }
  fs.mkdirSync(outDir, { recursive: true });
  const written = [];
  let items = [];
  increments.forEach((step, i) => {
    items = items.concat(step.items || []);
    const version = `v${String(i + 1).padStart(2, '0')}`;
    const hasDraftNote = items.some(it => it.kind === 'note' && it.text === DRAFT_NOTE.text);
    const spec = {
      name: `${name} ${version}${step.label ? ' ' + step.label : ''}`,
      scale,
      tags: ['AI', 'draft'],
      ai_inferred: true,
      text_scale: textScale || { title: 12, note: 10, small: 8, dim: 8 },
      version,
      items: hasDraftNote ? items : items.concat([DRAFT_NOTE])
    };
    const file = path.join(outDir, `increment-${i + 1}-${step.label ? step.label.replace(/\s+/g, '-') : version}.json`);
    fs.writeFileSync(file, JSON.stringify(spec, null, 2) + '\n');
    written.push(file);
  });
  return written;
}

module.exports = { writeIncrements, DRAFT_NOTE };
