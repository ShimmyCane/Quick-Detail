// Quick Detail app — Start.
// Loads settings and the last open detail, then opens it. Loaded last: everything it calls is defined by then.
// Also exposes window.QuickDetail.draw(spec) and window.__sketch for browser checks.
// Part of the app split across sketch/app/*.js. The parts share the page's global scope, so load order matters:
// see the <script> list in index.html and docs/code-map/index.html.
'use strict';

// ===================================================================
// Start
// ===================================================================

Promise.all([SK.DB.get('kv', 'settings'), SK.DB.get('kv', 'customTags'), SK.DB.get('kv', 'currentDetail'), SK.DB.all('details')])
  .then(function (r) {
    if (r[0]) settings = Object.assign(settings, r[0]);
    // The grid is on by default now. Settings saved before that carry grid: false, so switch it on once.
    if (!settings.gridOn2) { settings.grid = true; settings.gridOn2 = true; saveSettings(); }
    renderUnderlay();
    if (r[1]) customTags = r[1];
    window.__started = true;   // the page's startup-failure message stays hidden once the app is running
    setDetails(r[3]);   // names are counted from this list, so a new sketch never reuses a number
    var list = r[3].filter(function (x) { return !x.deletedAt; }).sort(function (a, b) { return b.modified - a.modified; });
    var d = list.filter(function (x) { return x.id === r[2]; })[0] || list[0];
    if (!d) { d = newDetail(); SK.DB.put('details', d); cacheDetail(d); }
    resize();
    return openDetail(d);
  })
  .catch(function (e) {
    fail(e, 'Storage is unavailable, so nothing will be kept: ');
    detail = newDetail();
    resize();
  });

// For tools and scripts: window.QuickDetail.draw(spec) makes and opens a detail from a JSON spec.
window.QuickDetail = { draw: drawFromSpec };

// For the browser test.
window.__sketch = { state: function () { return { detail: detail, sessions: sessions, take: take, view: view, sel: sel, pb: pb }; }, stopRecording: stopRecording };
