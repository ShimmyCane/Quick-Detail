// Builds the code map in docs/code-map/: the schematic (index.html) and one companion page per source file,
// listing its sections, its functions with line numbers and comments, and which files use each one.
// Everything is read from the code, so run it again after any change:  node tools/codemap.js
// The description of a file is its header comment, so keep those current. docs/code-map/review.html is written by hand.
'use strict';
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var OUT = path.join(ROOT, 'docs', 'code-map');
var FILES_OUT = path.join(OUT, 'files');

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
// `code` in prose becomes <code>.
function prose(s) { return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>'); }
function pageName(rel) { return rel.replace(/^sketch\//, '').replace(/\//g, '-').replace(/\.js$/, '') + '.html'; }

// ---- which files, in which group ----

var html = read('index.html');
var appOrder = [];
html.replace(/<script src="(sketch\/app\/[\w-]+\.js)\?v=[^"]+"><\/script>/g, function (m, f) { appOrder.push(f); });
var libOrder = [];
html.replace(/<script src="(sketch\/[\w-]+\.js)\?v=[^"]+"><\/script>/g, function (m, f) { libOrder.push(f); });
var cssOrder = [];
html.replace(/<link rel="stylesheet" href="(sketch\/css\/[\w-]+\.css)\?v=[^"]+">/g, function (m, f) { cssOrder.push(f); });
var notLoaded = fs.readdirSync(path.join(ROOT, 'sketch')).filter(function (f) { return /\.js$/.test(f); })
  .map(function (f) { return 'sketch/' + f; }).filter(function (f) { return libOrder.indexOf(f) < 0; });

// Where each file sits in the schematic.
var AREAS = [
  { key: 'pure', title: 'Pure logic', tone: 'b3', note: 'No DOM. Runs in the page and in the Node tests.',
    files: ['sketch/core.js', 'sketch/units.js', 'sketch/hatch.js', 'sketch/annot.js', 'sketch/blocks.js', 'sketch/author.js', 'sketch/parallel.js', 'sketch/gif.js', 'sketch/analyze.js', 'sketch/lanes.js'] },
  { key: 'services', title: 'Browser services', tone: 'b4', note: 'Canvas painting, IndexedDB, microphone, files on disk, Supabase.',
    files: ['sketch/paint.js', 'sketch/store.js', 'sketch/record.js', 'sketch/livefile.js', 'sketch/cloud.js'] },
  { key: 'foundation', title: 'App: foundation', tone: 'b1', note: 'State, saving, every change, recording.',
    files: ['sketch/app/base.js', 'sketch/app/details.js', 'sketch/app/changes.js', 'sketch/app/recording.js'] },
  { key: 'sheet', title: 'App: the sheet', tone: 'b2', note: 'Painting, pointer input, tools, selection, note text.',
    files: ['sketch/app/canvas.js', 'sketch/app/input.js', 'sketch/app/tools.js', 'sketch/app/draft.js', 'sketch/app/selection.js', 'sketch/app/editor.js'] },
  { key: 'panels', title: 'App: right panel', tone: 'b5', note: 'Info, settings, log and replay, exports, branches and blocks.',
    files: ['sketch/app/panels.js', 'sketch/app/changelog.js', 'sketch/app/settings.js', 'sketch/app/branches.js', 'sketch/app/log.js', 'sketch/app/export.js'] },
  { key: 'library', title: 'App: library', tone: 'b6', note: 'Library page, card popup, recycle bin, tags, cloud views.',
    files: ['sketch/app/library.js', 'sketch/app/library-info.js', 'sketch/app/bin.js', 'sketch/app/tags.js', 'sketch/app/cloud-ui.js'] },
  { key: 'boot', title: 'App: bars and start', tone: 'b1', note: 'Left bar, right rail, keys, then start-up (loaded last).',
    files: ['sketch/app/rail.js', 'sketch/app/start.js'] }
];
var allJs = [];
AREAS.forEach(function (a) { a.files.forEach(function (f) { allJs.push(f); }); });
appOrder.concat(libOrder).concat(notLoaded).forEach(function (f) { if (allJs.indexOf(f) < 0) allJs.push(f); });   // anything new shows up
var areaOf = {};
AREAS.forEach(function (a) { a.files.forEach(function (f) { areaOf[f] = a; }); });

// ---- reading a file ----

function stripComments(line) { return line.replace(/(^|[^:'"\w])\/\/.*$/, '$1'); }
// Code with string contents blanked, so words inside messages are not taken for uses.
function codeOnly(line) { return stripComments(line.replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""')); }

// The header: the comment lines at the top, without the shared "Part of the app split" lines.
function header(lines) {
  var out = [];
  for (var i = 0; i < lines.length && /^\s*\/\//.test(lines[i]); i++) {
    var t = lines[i].replace(/^\s*\/\/ ?/, '');
    if (/^Part of the app split|^see the <script> list/.test(t)) continue;
    out.push(t);
  }
  return out;
}

// The comment block right above line i.
function commentAbove(lines, i) {
  var out = [];
  for (var j = i - 1; j >= 0 && /^\s*\/\//.test(lines[j]); j--) {
    var t = lines[j].replace(/^\s*\/\/ ?/, '');
    if (/^=+$/.test(t) || /^-{4,}/.test(t)) break;
    out.unshift(t);
  }
  return out.join(' ').trim();
}

function parse(rel) {
  var src = read(rel);
  var lines = src.split('\n');
  var isApp = rel.indexOf('sketch/app/') === 0;
  var defs = [], sections = [];
  lines.forEach(function (l, i) {
    var m;
    // Section titles: a ==== rule with a title under it, or a "// ---- title ----" line.
    if (/^\s*\/\/ =+$/.test(l) && lines[i + 1] && /^\s*\/\/ \S/.test(lines[i + 1]) && !/=+$/.test(lines[i + 1])) {
      sections.push({ line: i + 1, title: lines[i + 1].replace(/^\s*\/\/ ?/, '') });
    } else if ((m = /^\s*\/\/ -{3,} (.+?) -{3,}\s*$/.exec(l)) || (m = /^\s*\/\/ -{3,} (.+?)$/.exec(l))) {
      sections.push({ line: i + 1, title: m[1].replace(/[-\s]+$/, '') });
    }
    if (isApp) {
      if ((m = /^function\s+([\w$]+)\s*\(([^)]*)\)/.exec(l))) defs.push({ name: m[1], args: m[2], line: i + 1, kind: 'function', note: commentAbove(lines, i) });
      else if ((m = /^var\s+([A-Z][A-Z0-9_]+)\s*=/.exec(l))) defs.push({ name: m[1], line: i + 1, kind: 'constant', note: commentAbove(lines, i) || (/\/\/\s*(.*)$/.exec(l) || [])[1] || '' });
      else if ((m = /^var\s+([a-z][\w$]*)\s*=\s*([^;]*);?\s*\/\/\s*(.*)$/.exec(l))) defs.push({ name: m[1], line: i + 1, kind: 'state', note: m[3] });
    } else {
      if ((m = /^\s*SK\.([\w$]+)\s*=\s*function\s*\(([^)]*)\)/.exec(l))) defs.push({ name: 'SK.' + m[1], args: m[2], line: i + 1, kind: 'export', note: commentAbove(lines, i) });
      else if ((m = /^\s*SK\.([\w$]+)\s*=\s*(?!function)/.exec(l))) defs.push({ name: 'SK.' + m[1], line: i + 1, kind: 'export value', note: commentAbove(lines, i) });
      else if ((m = /^ {2,4}function\s+([\w$]+)\s*\(([^)]*)\)/.exec(l))) defs.push({ name: m[1], args: m[2], line: i + 1, kind: 'private', note: commentAbove(lines, i) });
    }
  });
  return { rel: rel, lines: lines.length, head: header(lines), defs: defs, sections: sections,
    code: lines.map(codeOnly).join('\n') };
}

var parsed = {};
allJs.forEach(function (f) { parsed[f] = parse(f); });
var tests = fs.readdirSync(path.join(ROOT, 'tests')).filter(function (f) { return /\.js$/.test(f); });
var testCode = {};
tests.forEach(function (t) { testCode['tests/' + t] = read('tests/' + t).split('\n').map(codeOnly).join('\n'); });

// Who uses a name: every other file whose code mentions it. App functions are global, so a bare name counts.
// SK exports count as SK.name. Private helpers are used only in their own file, so they are not looked up.
function usedIn(def, owner) {
  if (def.kind === 'private') return [];
  var re = def.name.indexOf('SK.') === 0
    ? new RegExp('\\bSK\\.' + def.name.slice(3).replace(/\$/g, '\\$') + '\\b')
    : new RegExp('(^|[^.\\w$])' + def.name.replace(/\$/g, '\\$') + '\\b');
  var out = [];
  var isApp = owner.indexOf('sketch/app/') === 0;
  // A bare name also matches an object key ({ name: ... }) or a local of the same name; those are not uses.
  function uses(code) {
    if (!isApp) return re.test(code);
    var m, g = new RegExp(re.source, 'g');
    while ((m = g.exec(code))) {
      var after = code.slice(m.index + m[0].length, m.index + m[0].length + 3);
      var before = code.slice(Math.max(0, m.index - 9), m.index + m[1].length);
      if (/^\s*:/.test(after) && !/\?\s*$/.test(before)) continue;
      if (/(var|function)\s+$/.test(before)) continue;
      return true;
    }
    return false;
  }
  allJs.forEach(function (f) { if (f !== owner && uses(parsed[f].code)) out.push(f); });
  if (!isApp) Object.keys(testCode).forEach(function (t) { if (re.test(testCode[t])) out.push(t); });   // the tests never load the app parts
  return out;
}
// Used inside its own file too? (The definition itself counts once.)
function usedHere(def, owner) {
  var re = def.name.indexOf('SK.') === 0
    ? new RegExp('\\bSK\\.' + def.name.slice(3).replace(/\$/g, '\\$') + '\\b', 'g')
    : new RegExp('(^|[^.\\w$])' + def.name.replace(/\$/g, '\\$') + '\\b', 'g');
  return (parsed[owner].code.match(re) || []).length > 1;
}
allJs.forEach(function (f) { parsed[f].defs.forEach(function (d) { d.used = usedIn(d, f); d.here = usedHere(d, f); }); });

// ---- page parts ----

var STYLE = [
  ':root { --bg:#fbf6ea; --ink:#2d2a26; --muted:#6f685f; --mint:#d9f1ea; --peach:#fde3cf; --sky:#dbe7f6; --butter:#fff1b8; --sage:#dfeadf; --lilac:#ece3f6; --rose:#f8dfe4; }',
  '* { box-sizing: border-box; }',
  'body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 "Avenir Next", "Segoe UI", system-ui, sans-serif; }',
  'main { max-width: 1100px; margin: 0 auto; padding: 24px 16px 60px; }',
  'h1 { margin: 0 0 4px; } h1 code { font: inherit; background: none; padding: 0; } h3 { margin: 18px 0 6px; }',
  'h2 { margin: 32px 0 10px; padding: 6px 12px; border: 2.5px solid var(--ink); border-radius: 12px; background: var(--sage); box-shadow: 0 4px 0 var(--ink); display: inline-block; }',
  'a { color: inherit; } .muted { color: var(--muted); } .small { font-size: 13px; }',
  'nav.crumbs { font-size: 14px; margin-bottom: 12px; } nav.crumbs a { margin-right: 10px; }',
  '.flow { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; align-items: stretch; }',
  '.box { border: 2.5px solid var(--ink); border-radius: 14px; padding: 10px 12px; background: #fff; box-shadow: 0 4px 0 var(--ink); }',
  '.box h3 { margin: 0 0 4px; font-size: 15px; } .box p { margin: 0 0 6px; font-size: 13.5px; } .box ul { margin: 4px 0 0; padding-left: 18px; font-size: 13.5px; }',
  '.b1 { background: var(--butter); } .b2 { background: var(--peach); } .b3 { background: var(--mint); } .b4 { background: var(--sky); } .b5 { background: var(--lilac); } .b6 { background: var(--rose); }',
  '.arrow { text-align: center; font-size: 22px; font-weight: 800; margin: 6px 0; }',
  'table { width: 100%; border-collapse: collapse; background: #fff; border: 2.5px solid var(--ink); border-radius: 12px; overflow: hidden; }',
  'th, td { text-align: left; padding: 6px 10px; border-bottom: 1.5px solid #e6dccb; vertical-align: top; font-size: 14px; }',
  'th { background: var(--mint); position: sticky; top: 0; }',
  'code { font: 13px ui-monospace, Menlo, Consolas, monospace; background: #f4efe3; padding: 1px 4px; border-radius: 5px; }',
  'td.n { white-space: nowrap; font: 13px ui-monospace, Menlo, Consolas, monospace; color: var(--muted); }',
  'td.name { white-space: nowrap; } .tag { display: inline-block; font-size: 11.5px; padding: 0 6px; border: 1.5px solid var(--ink); border-radius: 8px; margin-left: 4px; background: #fff; }',
  '.wrap { overflow-x: auto; } pre { background: #fff; border: 2.5px solid var(--ink); border-radius: 12px; padding: 12px; overflow-x: auto; font: 13px/1.45 ui-monospace, Menlo, Consolas, monospace; }',
  'input.find { width: 100%; max-width: 420px; padding: 8px 12px; font: inherit; border: 2.5px solid var(--ink); border-radius: 10px; margin: 6px 0 10px; }',
  '.warn { border: 2.5px solid var(--ink); border-radius: 12px; padding: 10px 14px; background: var(--rose); box-shadow: 0 4px 0 var(--ink); }'
].join('\n');

function page(title, crumbs, body, script) {
  return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + esc(title) + '</title>\n<style>\n' + STYLE + '\n</style>\n</head>\n<body>\n<main>\n' +
    (crumbs ? '<nav class="crumbs">' + crumbs + '</nav>\n' : '') + body +
    '\n<p class="muted small">Generated by <code>node tools/codemap.js</code> from the code on ' + new Date().toISOString().slice(0, 10) +
    '. Line numbers are current as of that run. Do not edit this page by hand: change the code\'s comments and run the script again.</p>\n' +
    '</main>\n' + (script ? '<script>\n' + script + '\n</script>\n' : '') + '</body>\n</html>\n';
}

function fileLink(f, fromFiles) {
  if (!parsed[f]) return '<code>' + esc(f) + '</code>';
  return '<a href="' + (fromFiles ? '' : 'files/') + pageName(f) + '"><code>' + esc(f.replace(/^sketch\//, '')) + '</code></a>';
}
function usedCell(list, here) {
  if (!list.length) return here ? '<span class="muted">this file only</span>' : '<span class="tag">not used anywhere</span>';
  return list.map(function (f) {
    if (f.indexOf('tests/') === 0) return '<span class="tag">' + esc(f.replace('tests/', 'test: ')) + '</span>';
    return '<a href="' + pageName(f) + '">' + esc(f.replace(/^sketch\/(app\/)?/, '').replace(/\.js$/, '')) + '</a>';
  }).join(', ');
}

// ---- one page per file ----

if (!fs.existsSync(FILES_OUT)) fs.mkdirSync(FILES_OUT, { recursive: true });
fs.readdirSync(FILES_OUT).forEach(function (f) { if (/\.html$/.test(f)) fs.unlinkSync(path.join(FILES_OUT, f)); });

allJs.forEach(function (f) {
  var p = parsed[f], area = areaOf[f];
  var loadAt = appOrder.indexOf(f) >= 0 ? 'App part ' + (appOrder.indexOf(f) + 1) + ' of ' + appOrder.length + ' in the load order.'
    : libOrder.indexOf(f) >= 0 ? 'Library ' + (libOrder.indexOf(f) + 1) + ' of ' + libOrder.length + ' in the load order.'
    : 'Not loaded by index.html. Used by the Node tests only.';
  var body = '<h1><code>' + esc(f) + '</code></h1>\n<p class="muted">' + esc((area ? area.title + ' · ' : '') + p.lines + ' lines · ' + loadAt) + '</p>\n';
  if (notLoaded.indexOf(f) >= 0) body += '<p class="warn">This file is not in the page\'s &lt;script&gt; list, so the app does not use it yet.</p>\n';
  var head = p.head.slice();
  if (head.length) head[0] = head[0].replace(/^Quick Detail app — |^Quick Detail — |^Sketch v3 — /, '');
  body += '<h2>What it does</h2>\n<p>' + head.map(prose).join('<br>\n') + '</p>\n';
  if (p.sections.length) {
    body += '<h2>Sections</h2>\n<div class="wrap"><table><tr><th>Line</th><th>Section</th></tr>\n' +
      p.sections.map(function (s) { return '<tr><td class="n">' + s.line + '</td><td>' + prose(s.title) + '</td></tr>'; }).join('\n') + '\n</table></div>\n';
  }
  var groups = [['Functions', ['function', 'export']], ['Values', ['constant', 'state', 'export value']], ['Private helpers', ['private']]];
  groups.forEach(function (g) {
    var defs = p.defs.filter(function (d) { return g[1].indexOf(d.kind) >= 0; });
    if (!defs.length) return;
    var priv = g[0] === 'Private helpers';
    body += '<h2>' + g[0] + '</h2>\n<div class="wrap"><table><tr><th>Line</th><th>Name</th><th>What it does</th>' + (priv ? '' : '<th>Used in</th>') + '</tr>\n' +
      defs.map(function (d) {
        return '<tr><td class="n">' + d.line + '</td><td class="name"><code>' + esc(d.name) + (d.args != null ? '(' + esc(d.args) + ')' : '') + '</code>' +
          (d.kind === 'state' ? '<span class="tag">state</span>' : '') + '</td><td>' + (d.note ? prose(d.note) : '<span class="muted">—</span>') + '</td>' +
          (priv ? '' : '<td>' + usedCell(d.used, d.here) + '</td>') + '</tr>';
      }).join('\n') + '\n</table></div>\n';
  });
  var crumbs = '<a href="../index.html">← Code map</a><a href="../review.html">Review notes</a>';
  fs.writeFileSync(path.join(FILES_OUT, pageName(f)), page(f + ' · Quick Detail code map', crumbs, body));
});

// A page for the styles: each file and its section comments.
(function () {
  var body = '<h1>Styles: <code>sketch/css/</code></h1>\n<p class="muted">Seven files that load in order, as one stylesheet would. Later files refine rules in earlier ones, so keep the order.</p>\n';
  cssOrder.forEach(function (f, i) {
    var src = read(f), lines = src.split('\n');
    var head = (/^\/\* Quick Detail styles — ([\s\S]*?)\n\s*Part of/.exec(src) || [])[1] || '';
    body += '<h2>' + (i + 1) + '. <code>' + esc(f) + '</code></h2>\n<p>' + prose(head.replace(/\s+/g, ' ')) + ' <span class="muted">(' + lines.length + ' lines)</span></p>\n';
    var secs = [];
    lines.forEach(function (l, n) {
      var m = /^\/\*\s*-{2,}\s*(.+?)\s*-{2,}\s*\*\/\s*$/.exec(l) || /^\/\*\s*-{2,}\s*(.+?)$/.exec(l);
      if (m && n > 2) secs.push('<tr><td class="n">' + (n + 1) + '</td><td>' + prose(m[1].replace(/[-*/\s]+$/, '')) + '</td></tr>');
    });
    if (secs.length) body += '<div class="wrap"><table><tr><th>Line</th><th>Section</th></tr>\n' + secs.join('\n') + '\n</table></div>\n';
  });
  fs.writeFileSync(path.join(FILES_OUT, 'styles.html'), page('Styles · Quick Detail code map', '<a href="../index.html">← Code map</a><a href="../review.html">Review notes</a>', body));
})();

// ---- the schematic ----

var index = [];
index.push('<h1>Quick Detail: code map</h1>');
index.push('<p class="muted">How the app is put together, where each part lives, and where to find each function. ' +
  'Open a file\'s page for its sections, its functions with line numbers, and which files use each one. ' +
  'The findings of the v5 compaction review, and the open conflicts, are in <a href="review.html">review notes</a>.</p>');

index.push('<h2>1. How a drawing flows</h2>');
index.push('<div class="flow">' +
  '<div class="box b2"><h3>1 · Input</h3><p>Pen, finger, mouse and keys. <code>input.js</code> routes pointers; <code>rail.js</code> wires the bars and keys.</p></div>' +
  '<div class="box b2"><h3>2 · Tools</h3><p><code>tools.js</code> draws strokes, erases, picks and drags handles. <code>draft.js</code> runs the text, dimension and hatch steps.</p></div>' +
  '<div class="box b1"><h3>3 · One change</h3><p>Every edit is <code>commitPut</code>, <code>commitDel</code> or <code>commitReplace</code> in <code>changes.js</code>. Each pushes an undo step and logs an event.</p></div>' +
  '<div class="box b1"><h3>4 · After a change</h3><p><code>changed()</code> saves soon (<code>details.js</code> → IndexedDB and the JSON parallel), rewrites the live file, refreshes the chips and calls <code>redraw()</code>.</p></div>' +
  '<div class="box b4"><h3>5 · Paint</h3><p><code>canvas.js</code> → <code>SK.paint</code> (<code>paint.js</code>), which draws notes and dimensions from <code>annot.js</code> and hatches from <code>hatch.js</code>.</p></div>' +
  '</div>');
index.push('<div class="arrow">↓ the same events feed ↓</div>');
index.push('<div class="flow">' +
  '<div class="box b3"><h3>Recording</h3><p>A take starts with the pen (<code>recording.js</code>) and stores the events, with sound and speech from <code>record.js</code>. <code>SK.stateAt</code> and <code>SK.segment</code> (<code>core.js</code>) replay it and split it into scenes.</p></div>' +
  '<div class="box b5"><h3>Log and replay</h3><p><code>log.js</code>: a film strip of every scene; Replay, Restore and Branch from a scene.</p></div>' +
  '<div class="box b6"><h3>Library and cloud</h3><p><code>library.js</code> and its neighbours list, rate, tag and bin details. <code>cloud-ui.js</code> → <code>cloud.js</code> uploads to Supabase.</p></div>' +
  '<div class="box b5"><h3>Exports</h3><p><code>export.js</code>: PNG, JPEG with metadata (<code>analyze.js</code>), scene series, data and parallel JSON. GIFs use <code>gif.js</code>.</p></div>' +
  '</div>');
index.push('<p class="muted">The sheet is in real inches. A detail\'s scale sets only how big text, arrows and ticks are, so they keep their size on paper (<code>units.js</code>).</p>');

index.push('<h2>2. Where each file lives</h2>');
index.push('<div class="flow">' + AREAS.map(function (a) {
  return '<div class="box ' + a.tone + '"><h3>' + esc(a.title) + '</h3><p>' + esc(a.note) + '</p><ul>' +
    a.files.map(function (f) { return '<li>' + fileLink(f) + ' <span class="muted small">' + parsed[f].lines + '</span></li>'; }).join('') + '</ul></div>';
}).join('') + '<div class="box"><h3>Styles</h3><p>Seven ordered files in <code>sketch/css/</code>.</p><ul><li><a href="files/styles.html">sections of each file</a></li></ul></div></div>');
index.push('<pre>' + esc([
  'index.html              the page: markup for the sheet, bars, panels, library; loads every file below in order',
  'sketch/                 pure logic and browser services (each one adds to window.SK)',
  'sketch/app/             the app, in parts that share one global scope (base.js first, start.js last)',
  'sketch/css/             the stylesheet, in seven ordered files',
  'tests/                  Node tests (node tests/<name>.js); browser-smoke.js drives the page in headless Chromium',
  'tools/codemap.js        builds this code map',
  'docs/                   decisions, to-do, lessons learned, hatch reference, example detail specs, Supabase SQL',
  'docs/code-map/          this map, a page per file, and the review notes',
  'history/                archived versions (v1, v2, v4) and screenshots, linked from Settings → Version',
  '.claude/skills/         AI skills: draft_AI_detail, ai_draft_detail, ai_collab'
].join('\n')) + '</pre>');

index.push('<h2>3. Load order</h2>');
index.push('<p>The page loads the libraries first, then the app parts. The app parts are plain scripts that share one global scope: ' +
  'a function in one part can call a function in any other, at run time. Code that runs while the page loads (wiring a button, for example) may use only parts loaded before it. ' +
  'That is why <code>start.js</code>, which opens the first detail, is last. <code>tests/app-parts.js</code> checks the list and catches a name declared twice.</p>');
index.push('<div class="wrap"><table><tr><th>#</th><th>File</th><th>What it does</th></tr>' +
  libOrder.concat(['(Supabase client from the CDN, between gif.js and analyze.js)']).concat(appOrder).map(function (f, i) {
    if (!parsed[f]) return '<tr><td class="n"></td><td colspan="2" class="muted">' + esc(f) + '</td></tr>';
    return '<tr><td class="n">' + (i + 1) + '</td><td class="name">' + fileLink(f) + '</td><td>' + prose((parsed[f].head[0] || '').replace(/^Quick Detail app — |^Quick Detail — |^Sketch v3 — /, '')) + '</td></tr>';
  }).join('\n') + '</table></div>');
if (notLoaded.length) index.push('<p class="warn">Not loaded by the page: ' + notLoaded.map(function (f) { return fileLink(f); }).join(', ') + '. See the review notes.</p>');

index.push('<h2>4. The data</h2>');
index.push('<div class="flow">' +
  '<div class="box"><h3>Detail</h3><p><code>{ id, name, scale, tags, items, parentId, fork, versionOf, rating, created, modified, deletedAt }</code></p><p class="small">Made by <code>newDetail()</code> in <code>details.js</code>. The open one is the global <code>detail</code>.</p></div>' +
  '<div class="box"><h3>Items</h3><p><code>stroke</code> (pen line), <code>note</code> (text with leaders), <code>dim</code> (ortho, aligned or angular), <code>hatch</code>, <code>image</code> (underlay), <code>block</code> (another detail, as an underlay).</p><p class="small">Kept in <code>detail.items</code>, in draw order. <code>item.meta</code> holds element tags.</p></div>' +
  '<div class="box"><h3>Recording (session)</h3><p><code>{ id, detailId, created, duration, scale, base, events, speech, voice, audio, audioOffset }</code></p><p class="small">Events are <code>put</code>, <code>del</code>, <code>replace</code> and <code>mark</code> (new scene).</p></div>' +
  '<div class="box"><h3>Storage</h3><p>IndexedDB <code>wallsketch</code> v2 (<code>store.js</code>): <code>details</code>, <code>sessions</code> (index <code>detailId</code>), <code>parallels</code>, <code>kv</code> (settings, customTags, currentDetail).</p><p class="small">Pen colour and weight: <code>localStorage[\'qd.pen\']</code>.</p></div>' +
  '<div class="box"><h3>Cloud</h3><p>Supabase tables <code>sketch_details</code>, <code>sketch_recordings</code>, <code>sketch_snapshots</code>, <code>table_index</code>; bucket <code>sketch-media</code>.</p><p class="small"><code>cloud.js</code>; SQL in <code>docs/supabase-sketch.sql</code>.</p></div>' +
  '</div>');

// Every function, for the search box.
var rows = [];
allJs.forEach(function (f) {
  parsed[f].defs.forEach(function (d) {
    if (d.kind === 'private' || d.kind === 'state') return;
    rows.push({ name: d.name, file: f, line: d.line, note: d.note });
  });
});
rows.sort(function (a, b) { return a.name.replace(/^SK\./, '').toLowerCase() < b.name.replace(/^SK\./, '').toLowerCase() ? -1 : 1; });
index.push('<h2>5. Find a function</h2>');
index.push('<p class="muted">' + rows.length + ' functions and values. App functions are global; library ones are on <code>SK</code>. Private helpers are listed on each file\'s page.</p>');
index.push('<input class="find" id="find" type="search" placeholder="Type part of a name or a word…" aria-label="Find a function">');
index.push('<div class="wrap"><table id="fns"><tr><th>Name</th><th>File : line</th><th>What it does</th></tr>' + rows.map(function (r) {
  return '<tr><td class="name"><code>' + esc(r.name) + '</code></td><td class="name"><a href="files/' + pageName(r.file) + '">' + esc(r.file.replace(/^sketch\//, '')) + '</a> : ' + r.line + '</td><td>' + prose(r.note || '') + '</td></tr>';
}).join('\n') + '</table></div>');

index.push('<h2>6. Tests</h2>');
index.push('<p>Run each from the project folder with <code>node tests/&lt;name&gt;.js</code>. They need no browser, except <code>browser-smoke.js</code>, which uses Playwright and skips itself when Playwright is not installed.</p>');
index.push('<div class="wrap"><table><tr><th>Test</th><th>What it checks</th></tr>' + tests.map(function (t) {
  var first = (read('tests/' + t).split('\n')[0] || '').replace(/^\/\/ ?/, '');
  return '<tr><td class="name"><code>tests/' + esc(t) + '</code></td><td>' + prose(first) + '</td></tr>';
}).join('\n') + '</table></div>');

index.push('<h2>7. Changing the code safely</h2>');
index.push('<ul>' + [
  'Bump the <code>?v=</code> value on every <code>src</code> and <code>href</code> in <code>index.html</code> whenever any file in <code>sketch/</code> changes. <code>tests/app-parts.js</code> fails if they differ.',
  'A new app part goes in <code>sketch/app/</code>, starts with a <code>// Quick Detail app — Title.</code> line, and gets a <code>&lt;script&gt;</code> tag before <code>start.js</code>.',
  'Top-level names in <code>sketch/app/</code> are global. Pick names that say what they are, and do not reuse one for a local variable that hides a global helper (<code>byId</code>, <code>W</code>, <code>H</code>, <code>el</code>).',
  'Every edit to the open detail goes through <code>commitPut</code>, <code>commitDel</code> or <code>commitReplace</code>, so undo, the recording and saving stay in step.',
  'A user-visible change gets a line in <code>sketch/app/changelog.js</code>.',
  'New maths goes in a pure file in <code>sketch/</code> with a Node test.',
  'Run every test, then <code>node tools/codemap.js</code> to refresh this map.'
].map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ul>');

var findScript = "var box = document.getElementById('find'), rows = document.querySelectorAll('#fns tr');\n" +
  "box.addEventListener('input', function () { var q = box.value.trim().toLowerCase();\n" +
  "  for (var i = 1; i < rows.length; i++) rows[i].hidden = q && rows[i].textContent.toLowerCase().indexOf(q) < 0; });";
fs.writeFileSync(path.join(OUT, 'index.html'), page('Quick Detail code map', '<a href="review.html">Review notes</a><a href="../../index.html">Open the app</a>', index.join('\n'), findScript));

var unused = [];
allJs.forEach(function (f) { parsed[f].defs.forEach(function (d) { if (d.kind !== 'private' && !d.used.length && !d.here) unused.push(f + ':' + d.line + ' ' + d.name); }); });
if (unused.length) console.log('not used anywhere (check before deleting; some are kept on purpose):\n  ' + unused.join('\n  '));
console.log('code map: ' + allJs.length + ' file pages, styles page, index with ' + rows.length + ' functions → docs/code-map/');
