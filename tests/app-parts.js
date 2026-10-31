// Checks the app's parts in sketch/app/: they share one global scope, so a name declared twice would silently
// replace the first. Also checks that index.html loads every part, once, with start.js last and one ?v= value.
// Run from the project folder:  node tests/app-parts.js
'use strict';
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');
var failures = 0;
function check(name, ok, info) {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (info ? '  ' + info : ''));
  if (!ok) failures++;
}

var dir = path.join(root, 'sketch', 'app');
var parts = fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f); });
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// Script order in index.html.
var loaded = [];
html.replace(/<script src="sketch\/app\/([\w-]+\.js)\?v=[^"]+"><\/script>/g, function (m, f) { loaded.push(f); });
check('every part is loaded by index.html', parts.every(function (f) { return loaded.indexOf(f) >= 0; }),
  parts.filter(function (f) { return loaded.indexOf(f) < 0; }).join(', '));
check('index.html loads no missing part', loaded.every(function (f) { return parts.indexOf(f) >= 0; }),
  loaded.filter(function (f) { return parts.indexOf(f) < 0; }).join(', '));
check('each part is loaded once', loaded.length === new Set(loaded).size);
check('base.js is first and start.js is last', loaded[0] === 'base.js' && loaded[loaded.length - 1] === 'start.js');

// One cache value for every local file, so a browser never mixes old and new files.
var versions = {};
html.replace(/(?:src|href)="sketch\/[^"?]+\?v=([^"]+)"/g, function (m, v) { versions[v] = true; });
check('every local file carries the same ?v= value', Object.keys(versions).length === 1, Object.keys(versions).join(', '));

// Top-level names: function declarations and var lists that start a line (the parts are not indented).
function topNames(src) {
  var names = [];
  var code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(function (l) {
    return l.replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/\/\/.*$/, '');
  });
  code.forEach(function (l) {
    var m = /^function\s+([\w$]+)/.exec(l);
    if (m) names.push(m[1]);
    m = /^var\s+(.*)$/.exec(l);
    if (m) {
      var depth = 0, cur = '', list = [];
      for (var i = 0; i < m[1].length; i++) {
        var ch = m[1][i];
        if ('([{'.indexOf(ch) >= 0) depth++;
        if (')]}'.indexOf(ch) >= 0) depth--;
        if (ch === ',' && depth === 0) { list.push(cur); cur = ''; } else cur += ch;
      }
      list.push(cur);
      list.forEach(function (p) { var n = /^\s*([\w$]+)/.exec(p); if (n) names.push(n[1]); });
    }
  });
  return names;
}
var owner = {}, clashes = [];
parts.forEach(function (f) {
  topNames(fs.readFileSync(path.join(dir, f), 'utf8')).forEach(function (n) {
    if (owner[n] && owner[n] !== f) clashes.push(n + ' (' + owner[n] + ', ' + f + ')');
    else if (owner[n] === f) clashes.push(n + ' (twice in ' + f + ')');
    owner[n] = f;
  });
});
check('no top-level name is declared in two places', !clashes.length, clashes.join('; '));

// Names a browser already defines on window. Declaring one at the top level of a part would clobber it.
var RESERVED = ['name', 'status', 'top', 'parent', 'self', 'frames', 'length', 'history', 'location', 'screen', 'event',
  'open', 'close', 'print', 'stop', 'find', 'focus', 'blur', 'scroll', 'origin', 'external', 'toolbar', 'menubar',
  'content', 'sidebar', 'dump', 'home', 'back', 'forward', 'opener', 'closed', 'caches', 'crypto', 'performance', 'navigator', 'document', 'window'];
var bad = Object.keys(owner).filter(function (n) { return RESERVED.indexOf(n) >= 0; });
check('no top-level name shadows a browser global', !bad.length, bad.join(', '));

// Each part says what it holds in its first line, for docs/code-map.
var bare = parts.filter(function (f) { return !/^\/\/ Quick Detail app — .+\./.test(fs.readFileSync(path.join(dir, f), 'utf8')); });
check('every part starts with its description line', !bare.length, bare.join(', '));

console.log(failures ? failures + ' failed' : 'all passed');
process.exit(failures ? 1 : 0);
