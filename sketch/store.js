// Sketch v3 — storage in IndexedDB. Details, recordings (with their audio) and small settings.
// Its own database ('wallsketch'), so the archived v2 page keeps its data untouched.
(function (root) {
  'use strict';

  var SK = root.SK || {};
  var opened = null;

  function open() {
    if (!opened) opened = new Promise(function (resolve, reject) {
      var req = indexedDB.open('wallsketch', 2);
      req.onupgradeneeded = function (e) {
        var db = req.result;
        if (e.oldVersion < 1) {
          db.createObjectStore('details', { keyPath: 'id' });
          db.createObjectStore('sessions', { keyPath: 'id' }).createIndex('detailId', 'detailId');
          db.createObjectStore('kv');
        }
        if (e.oldVersion < 2) db.createObjectStore('parallels');   // one JSON parallel per detail, keyed by detail id
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return opened;
  }

  function run(store, mode, action) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(store, mode);
        var req = action(t.objectStore(store));
        var out;
        if (req) req.onsuccess = function () { out = req.result; };
        t.oncomplete = function () { resolve(out); };
        t.onerror = t.onabort = function () { reject(t.error || new Error('Storage failed')); };
      });
    });
  }

  SK.DB = {
    put: function (store, value, key) {
      return run(store, 'readwrite', function (s) { return key === undefined ? s.put(value) : s.put(value, key); });
    },
    get: function (store, key) { return run(store, 'readonly', function (s) { return s.get(key); }); },
    all: function (store) { return run(store, 'readonly', function (s) { return s.getAll(); }); },
    del: function (store, key) { return run(store, 'readwrite', function (s) { return s.delete(key); }); },
    sessionsOf: function (detailId) {
      return run('sessions', 'readonly', function (s) { return s.index('detailId').getAll(detailId); });
    }
  };

  root.SK = SK;
})(window);
