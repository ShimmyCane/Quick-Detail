// Builds the replay viewers listed in docs/replays.json and rewrites the "Replay viewers" list on files.html.
//
//   node tools/replay/build-replays.js
//
// For each entry with kind "steps":
//   - reads every spec in "specs" (sorted by file name): one spec per step, cumulative
//   - reads the notes for each step from "notes" (keyed by spec file name without .json)
//   - writes "output" (steps.json) and "page" (an HTML page with the steps embedded, from docs/replay/steps-template.html)
// For each entry with kind "page": nothing to build; it is listed as is.
// Then the list between <!-- replays:start --> and <!-- replays:end --> in files.html is rewritten from the manifest,
// so a new entry shows up on files.html without editing the page by hand.
//
// Writes only generated files: steps.json, the step pages, and files.html's replay list.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const manifestPath = path.join(ROOT, 'docs', 'replays.json');
const template = fs.readFileSync(path.join(ROOT, 'docs', 'replay', 'steps-template.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const rel = (from, to) => path.relative(path.dirname(from), to).split(path.sep).join('/');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function buildSteps(entry) {
  const specDir = path.join(ROOT, entry.specs);
  const renderDir = path.join(ROOT, entry.renders);
  const notes = JSON.parse(fs.readFileSync(path.join(ROOT, entry.notes), 'utf8')).steps || {};
  const pagePath = path.join(ROOT, entry.page);
  const outPath = path.join(ROOT, entry.output);

  const files = fs.readdirSync(specDir).filter(f => f.endsWith('.json')).sort();
  if (!files.length) throw new Error('no specs in ' + entry.specs);

  const steps = files.map((f, i) => {
    const id = path.basename(f, '.json');
    const spec = JSON.parse(fs.readFileSync(path.join(specDir, f), 'utf8'));
    const note = notes[id] || {};
    const tierTag = (spec.tags || []).find(t => /^tier \d+$/.test(t));
    const title = (spec.tags || []).slice(-1)[0] || id;
    const png = path.join(renderDir, id + '.png');
    if (!fs.existsSync(png)) throw new Error('missing render for ' + id + ': ' + entry.renders);
    return {
      n: i + 1,
      id,
      title: title.charAt(0).toUpperCase() + title.slice(1),
      tier: tierTag ? Number(tierTag.split(' ')[1]) : null,
      items: (spec.items || []).length,
      spec: path.relative(ROOT, path.join(specDir, f)).split(path.sep).join('/'),
      render: rel(pagePath, png),
      description: note.description || '',
      changes: note.changes || [],
      gaps: note.gaps || []
    };
  });

  const first = JSON.parse(fs.readFileSync(path.join(specDir, files[0]), 'utf8'));
  const data = {
    schema: 'quick-detail/steps-1',
    name: entry.title,
    subtitle: entry.description || '',
    scale: first.scale,
    draft_note: entry.draft_note || 'Draft: verify before use.',
    steps
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(data, null, 1) + '\n');
  fs.mkdirSync(path.dirname(pagePath), { recursive: true });
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const marker = '<script id="steps-data" type="application/json">__STEPS_JSON__</script>';
  if (!template.includes(marker)) throw new Error('template has no steps-data placeholder');
  fs.writeFileSync(pagePath, template.replace(marker, () => `<script id="steps-data" type="application/json">${json}</script>`));
  console.log(`built ${entry.page}: ${steps.length} steps`);
  return entry.page;
}

const hrefs = manifest.replays.map(entry => {
  if (entry.kind === 'steps') return { entry, href: buildSteps(entry) };
  return { entry, href: entry.href };
});

// Rewrite the replay list on files.html.
const filesPath = path.join(ROOT, 'files.html');
let html = fs.readFileSync(filesPath, 'utf8');
const items = hrefs.map(({ entry, href }) =>
  `    <li><a href="${esc(href)}">${esc(entry.title)}</a><br><span class="muted">${esc(entry.description || '')}</span></li>`
).join('\n');
const block = `  <!-- replays:start -->\n  <ul>\n${items}\n  </ul>\n  <!-- replays:end -->`;
if (html.includes('<!-- replays:start -->')) {
  html = html.replace(/  <!-- replays:start -->[\s\S]*?<!-- replays:end -->/, block);
} else {
  html = html.replace(/  <ul>\n    <li><a href="docs\/caam\/caam-history\.html">[\s\S]*?<\/ul>/, block);
}
fs.writeFileSync(filesPath, html);
console.log(`files.html: ${hrefs.length} replay entries`);
