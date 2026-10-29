// Quick Detail — a JSON file on your computer that is rewritten as you draw. The browser keeps a handle to a file
// you choose once; each change writes the detail's parallel into it (see sketch/parallel.js). Needs a browser with the
// File System Access API (Chrome or Edge on a computer). Elsewhere it reports that, and the database copy still saves.
(function (root) {
  'use strict';

  var SK = root.SK || {};
  var linked = {};    // detail id -> file handle, with permission granted this session
  var stored = {};    // detail id -> file handle saved from an earlier session, waiting for a click to resume
  var KEY = function (id) { return 'live:' + id; };

  SK.LiveFile = {
    supported: function () { return typeof root.showSaveFilePicker === 'function'; },

    // Is this detail's file being kept in sync right now?
    linked: function (id) { return !!linked[id]; },

    // A file from an earlier session that needs one click to resume.
    waiting: function (id) { return !linked[id] && !!stored[id]; },

    name: function (id) { return (linked[id] || stored[id] || {}).name || ''; },

    // Ask for a file. Must come from a click.
    choose: function (id, suggestedName) {
      return root.showSaveFilePicker({
        suggestedName: suggestedName,
        types: [{ description: 'Quick Detail JSON', accept: { 'application/json': ['.json'] } }]
      }).then(function (h) {
        linked[id] = h;
        delete stored[id];
        SK.DB.put('kv', h, KEY(id)).catch(function () {});   // remembered for the next visit
        return h;
      });
    },

    // Load a file saved from an earlier visit. Keeps it if the browser still allows writing without asking.
    restore: function (id) {
      return SK.DB.get('kv', KEY(id)).then(function (h) {
        if (!h) return false;
        return h.queryPermission({ mode: 'readwrite' }).then(function (state) {
          if (state === 'granted') linked[id] = h; else stored[id] = h;
          return state === 'granted';
        });
      }).catch(function () { return false; });
    },

    // Resume a stored file. Must come from a click.
    resume: function (id) {
      var h = stored[id];
      if (!h) return Promise.resolve(false);
      return h.requestPermission({ mode: 'readwrite' }).then(function (state) {
        if (state !== 'granted') return false;
        linked[id] = h;
        delete stored[id];
        return true;
      });
    },

    stop: function (id) {
      delete linked[id];
      delete stored[id];
      SK.DB.del('kv', KEY(id)).catch(function () {});
    },

    // Replace the file's contents with text.
    write: function (id, text) {
      var h = linked[id];
      if (!h) return Promise.resolve();
      return h.createWritable().then(function (w) {
        return w.write(text).then(function () { return w.close(); });
      });
    }
  };

  root.SK = SK;
})(window);
