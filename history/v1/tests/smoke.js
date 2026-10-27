// Quick Detail — Node smoke test for the core (no browser needed).
// Run from the project folder:  node tests/smoke.js [outDir]
'use strict';
var path = require('path');
var fs = require('fs');
['vocab', 'geom', 'model', 'primitives', 'svg', 'export', 'review', 'sample'].forEach(function (f) {
  require(path.join(__dirname, '..', 'js', f + '.js'));
});
var QD = globalThis.QD;
var failures = 0;
function check(name, ok, info) {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (info ? '  ' + info : ''));
  if (!ok) failures++;
}

var d = QD.sampleDetail();
check('sample validates', QD.M.validate(d).length === 0, QD.M.validate(d).join(' | '));

check('formatLength 20in', QD.G.formatLength(20, 'in') === "1'-8\"", QD.G.formatLength(20, 'in'));
check('formatLength 10.5in', QD.G.formatLength(10.5, 'in') === '10 1/2"', QD.G.formatLength(10.5, 'in'));
check('formatLength 0.25in', QD.G.formatLength(0.25, 'in') === '1/4"', QD.G.formatLength(0.25, 'in'));
check('formatLength mm', QD.G.formatLength(203.2, 'mm') === '203');

var sq = [[0, 0], [10, 0], [10, 10], [0, 10]];
var h = QD.G.hatchLines(sq, 0, 1);
check('hatch lines in square', h.length === 9 || h.length === 10, h.length + ' lines');
check('hatch line clipped to width', h.every(function (s) { return Math.abs(QD.G.dist(s[0], s[1]) - 10) < 1e-6; }));

var prims = QD.P.build(d, {});
check('primitives built', prims.length > 50, prims.length + ' prims');
var kinds = {};
prims.forEach(function (p) { kinds[p.kind] = (kinds[p.kind] || 0) + 1; });
check('has text, path, circle', kinds.text && kinds.path && kinds.circle, JSON.stringify(kinds));

var svg = QD.S.document(d, {});
check('svg document', /^<\?xml/.test(svg) && svg.indexOf('</svg>') > 0 && svg.indexOf('NaN') < 0);

var pdf = QD.X.pdf(d, {});
var startxref = +/startxref\n(\d+)/.exec(pdf)[1];
check('pdf xref offset', pdf.slice(startxref, startxref + 4) === 'xref');
var objOk = true;
var xrefRows = pdf.slice(startxref).split('\n').slice(3, 9);
xrefRows.forEach(function (row, i) {
  var off = +row.slice(0, 10);
  if (pdf.slice(off, off + String(i + 1).length + 6) !== (i + 1) + ' 0 obj') objOk = false;
});
check('pdf object offsets', objOk);
var streamLen = +/\/Length (\d+) >>\nstream\n/.exec(pdf)[1];
var sIdx = pdf.indexOf('stream\n') + 7;
check('pdf stream length', pdf.slice(sIdx + streamLen, sIdx + streamLen + 10) === '\nendstream');
check('pdf has no NaN', pdf.indexOf('NaN') < 0);

var dxf = QD.X.dxf(d, {});
var lines = dxf.trim().split('\n');
check('dxf even group pairs', lines.length % 2 === 0, lines.length + ' lines');
check('dxf ends with EOF', lines[lines.length - 1] === 'EOF');
check('dxf has membrane layer', dxf.indexOf('QD-P5-ROOFING_MEMBRANE') > 0);
check('dxf has no NaN', dxf.indexOf('NaN') < 0);

var findings = QD.R.run(d);
check('review runs', Array.isArray(findings), findings.length + ' findings');
findings.forEach(function (f) { console.log('     - [' + f.result + '] ' + f.text); });

var bad = QD.M.clone(d);
bad.relationships.push({ type: 'annotates', from: 'l1', to: 'zzz' });
check('validate catches missing target', QD.M.validate(bad).some(function (m) { return /zzz/.test(m); }));

var out = process.argv[2];
if (out) {
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'sample.svg'), svg);
  fs.writeFileSync(path.join(out, 'sample.pdf'), pdf, 'latin1');
  fs.writeFileSync(path.join(out, 'sample.dxf'), dxf);
  fs.writeFileSync(path.join(out, 'sample.json'), JSON.stringify(d, null, 2));
  console.log('wrote exports to ' + out);
}
console.log(failures ? failures + ' failure(s)' : 'all checks passed');
process.exit(failures ? 1 : 0);
