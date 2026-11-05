// Uploads one AI draft to the cloud library as a single detail, with its increments as a linear version history.
//
//   node tools/library/upload-draft-history.js --specs docs/examples/lucas-museum --local-id ai-lucas-museum-site \
//        --name "LA Lucas Museum, site plan (AI draft)" --scale '1/16"=1'"'"'-0"' [--renders <dir>] [--tags a,b,c] \
//        [--replace-increment-rows ai-lucas-museum-site-inc-01,ai-lucas-museum-site-inc-05] [--upload]
//
// What it does:
//   1. Draws each increment spec (docs/examples/<dir>/*.json, sorted by name) in headless Chromium, using the same
//      window.QuickDetail.draw path as the JSON panel, so the items are in the app's stored format.
//   2. Writes ONE sketch_details row: the last increment's items (the full drawing), with metadata.history listing
//      every increment in order.
//   3. Writes sketch_versions rows 1..N, one per increment (label = increment title, file_path = its spec).
//   4. Optionally soft-deletes older per-increment rows (deleted_at = now), so they sit in the cloud recycle bin.
//
// Dry run by default: it prints the plan and writes nothing. --upload needs these environment variables:
//   SUPABASE_URL          e.g. https://<project>.supabase.co  (the Architecture project)
//   SUPABASE_SERVICE_KEY  a service role key for that project; keep it out of the repo
// Writes go only to sketch_details and sketch_versions. Nothing else is touched.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const flag = k => args.indexOf('--' + k) >= 0;

const specDir = path.resolve(ROOT, opt('specs', ''));
const localId = opt('local-id', '');
const name = opt('name', '');
const scale = opt('scale', '');
const rendersDir = opt('renders', '');
const tags = (opt('tags', '') || '').split(',').map(s => s.trim()).filter(Boolean);
const replaceRows = (opt('replace-increment-rows', '') || '').split(',').map(s => s.trim()).filter(Boolean);
const upload = flag('upload');

if (!specDir || !localId || !name || !scale) {
  console.error('usage: --specs <dir> --local-id <id> --name <title> --scale <scale> [--renders <dir>] [--tags a,b] [--replace-increment-rows id1,id2] [--upload]');
  process.exit(2);
}

// Pull the increment title out of each spec name, e.g. "... increment 3 of 10 (AI draft)".
const titleOf = spec => {
  const m = /increment (\d+) of (\d+)/i.exec(spec.name || '');
  return m ? { n: +m[1], of: +m[2] } : null;
};

async function drawAll(files) {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const out = [];
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const r = await page.evaluate(async s => {
      try { const d = await window.QuickDetail.draw(s); return { ok: true, items: d.items, name: d.name, scale: d.scale }; }
      catch (e) { return { ok: false, err: String((e && e.message) || e) }; }
    }, text);
    if (!r.ok) throw new Error(`${path.basename(f)} failed to draw: ${r.err}`);
    out.push({ file: f, spec: JSON.parse(text), items: r.items });
  }
  await browser.close();
  return out;
}

async function rest(method, table, body, query = '') {
  const url = `${process.env.SUPABASE_URL}/rest/v1/${table}${query}`;
  const res = await fetch(url, {
    method,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${table} -> ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

(async () => {
  const files = fs.readdirSync(specDir).filter(f => f.endsWith('.json')).sort().map(f => path.join(specDir, f));
  if (!files.length) throw new Error('no spec files in ' + specDir);
  const drawn = await drawAll(files);

  const last = drawn[drawn.length - 1];
  const rel = p => path.relative(ROOT, p);
  const renderFor = f => {
    if (!rendersDir) return null;
    const png = path.join(path.resolve(ROOT, rendersDir), path.basename(f, '.json') + '.png');
    return fs.existsSync(png) ? rel(png) : null;
  };
  const history = drawn.map((d, i) => ({
    version: i + 1,
    title: (d.spec.name || '').replace(/ \(AI draft\)$/, ''),
    items: d.items.length,
    spec: rel(d.file),
    render: renderFor(d.file)
  }));

  const row = {
    local_id: localId,
    name,
    scale,
    tags: ['AI', 'draft', ...tags],
    items: last.items,
    metadata: {
      ai_inferred: true,
      draft_note: 'Draft: verify before use. Schematic. Placeholders are marked (verify).',
      source_dir: rel(specDir),
      history: { kind: 'linear', steps: history.length, current_version: history.length }
    },
    version: 1
  };
  // Keep the same history shape in metadata, so the list is in the row without a join.
  row.metadata.history.list = history;

  console.log(`plan: 1 sketch_details row "${localId}" with ${last.items.length} items, ${history.length} versions`);
  history.forEach(h => console.log(`  v${h.version}  ${h.items} items  ${h.title}`));
  if (replaceRows.length) console.log(`soft-delete (recycle bin): ${replaceRows.join(', ')}`);

  if (!upload) { console.log('dry run: nothing written. Add --upload with SUPABASE_URL and SUPABASE_SERVICE_KEY to write.'); return; }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) throw new Error('set SUPABASE_URL and SUPABASE_SERVICE_KEY');

  const [saved] = await rest('POST', 'sketch_details', row);
  console.log('saved sketch_details', saved.id);
  await rest('POST', 'sketch_versions', history.map(h => ({
    detail_id: saved.id, version: h.version, file_path: h.spec, label: h.title
  })));
  console.log(`saved ${history.length} sketch_versions`);
  for (const id of replaceRows) {
    await rest('PATCH', 'sketch_details', { deleted_at: new Date().toISOString() }, `?local_id=eq.${encodeURIComponent(id)}`);
    console.log('moved to recycle bin:', id);
  }
})().catch(e => { console.error(e.message); process.exit(1); });
