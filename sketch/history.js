// Quick Detail — undo for the drawing log and the viewer. An action records only the records it changed, each with
// its value before the action, so undo puts those values back and never rewinds the sheet or other work.
// Pure: runs in the page and in Node tests. The database is passed in, so tests can use a stand-in.
(function (root) {
  'use strict';

  var SK = root.SK || {};

  SK.HISTORY_LIMIT = 100;

  // A stack of undo entries. An entry: { details: [{ id, before }], sessions: [{ id, before }] }, where before is the
  // record as it was (null if it did not exist). The oldest entries drop off past HISTORY_LIMIT.
  SK.History = function () {
    var undos = [];
    return {
      push: function (entry) {
        undos.push(entry);
        if (undos.length > SK.HISTORY_LIMIT) undos.shift();
      },
      pop: function () { return undos.pop() || null; },
      size: function () { return undos.length; },
      clear: function () { undos = []; }
    };
  };

  // The records an action is about to change, with their current values. ids: the ids to capture.
  SK.befores = function (list, ids) {
    return ids.map(function (id) {
      var found = null;
      for (var i = 0; i < list.length; i++) if (list[i].id === id) { found = list[i]; break; }
      return { id: id, before: found };
    });
  };

  // The writes that put an entry's records back: [{ store, id, value }]. A null value means the record is removed.
  SK.undoWrites = function (entry) {
    var out = [];
    (entry.details || []).forEach(function (c) { out.push({ store: 'details', id: c.id, value: c.before || null }); });
    (entry.sessions || []).forEach(function (c) { out.push({ store: 'sessions', id: c.id, value: c.before || null }); });
    return out;
  };

  // A record list after writes: each write replaces, adds or removes the record with its id. Returns a new list.
  SK.mergeRecords = function (list, writes) {
    var out = list.slice();
    writes.forEach(function (w) {
      var i = -1;
      for (var j = 0; j < out.length; j++) if (out[j].id === w.id) { i = j; break; }
      if (!w.value) { if (i >= 0) out.splice(i, 1); }
      else if (i >= 0) out[i] = w.value;
      else out.push(w.value);
    });
    return out;
  };

  // Writes the records to a database with put(store, value) and del(store, id), both returning promises.
  SK.applyWrites = function (db, writes) {
    return Promise.all(writes.map(function (w) {
      return w.value ? db.put(w.store, w.value) : db.del(w.store, w.id);
    }));
  };

  root.SK = SK;
  if (typeof module !== 'undefined' && module.exports) module.exports = SK;
})(typeof window !== 'undefined' ? window : globalThis);
