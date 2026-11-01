// Quick Detail — saved versions: the files one cloud version holds, and the checks on them. A version is one ZIP:
//   state.json     the editable drawing at each restore point of every lane, and the copies of the sources its blocks use
//   manifest.json  the tree: addresses, forks, notes and the words said, and the version number
//   points/<lane>-<step>.png   one transparent PNG per restore point, for looking at it outside the app
// Pure: runs in the page and in Node tests. Drawing the PNGs is in the page, not here.
(function (root) {
  'use strict';

  var SK = root.SK || {};

  SK.VERSION_SCHEMA = 'quick-detail/version-1';

  // ---- CRC-32, for the ZIP ----
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  SK.crc32 = function (bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };

  // ---- ZIP, stored (no compression): the PNGs are already compressed and the JSON is small ----

  // files: [{ name, data }] with data as Uint8Array. Returns the whole archive as a Uint8Array.
  SK.makeZip = function (files) {
    var enc = new TextEncoder();
    var parts = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = enc.encode(f.name);
      var data = f.data;
      var crc = SK.crc32(data);
      var local = new Uint8Array(30 + name.length);
      var lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);          // version needed
      lv.setUint16(6, 0x0800, true);      // names are UTF-8
      lv.setUint16(8, 0, true);           // stored
      lv.setUint16(10, 0, true);          // time
      lv.setUint16(12, 0x21, true);       // date: 1980-01-01
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, name.length, true);
      lv.setUint16(28, 0, true);
      local.set(name, 30);
      parts.push(local, data);

      var cd = new Uint8Array(46 + name.length);
      var cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0x21, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      cd.set(name, 46);
      central.push(cd);
      offset += local.length + data.length;
    });
    var cdSize = central.reduce(function (n, c) { return n + c.length; }, 0);
    var end = new Uint8Array(22);
    var ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);
    var all = parts.concat(central, [end]);
    var total = all.reduce(function (n, p) { return n + p.length; }, 0);
    var out = new Uint8Array(total), at = 0;
    all.forEach(function (p) { out.set(p, at); at += p.length; });
    return out;
  };

  // Reads a stored ZIP back into { name: Uint8Array }. Throws on anything it cannot read.
  SK.readZip = function (bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var eocd = -1;
    for (var i = bytes.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Not a version file: no directory in the ZIP.');
    var count = dv.getUint16(eocd + 10, true);
    var at = dv.getUint32(eocd + 16, true);
    var dec = new TextDecoder();
    var out = {};
    for (var n = 0; n < count; n++) {
      if (dv.getUint32(at, true) !== 0x02014b50) throw new Error('Not a version file: bad directory entry.');
      var method = dv.getUint16(at + 10, true);
      var csize = dv.getUint32(at + 20, true);
      var nlen = dv.getUint16(at + 28, true), xlen = dv.getUint16(at + 30, true), clen = dv.getUint16(at + 32, true);
      var local = dv.getUint32(at + 42, true);
      var name = dec.decode(bytes.subarray(at + 46, at + 46 + nlen));
      if (method !== 0) throw new Error('Not a version file: "' + name + '" is compressed.');
      var dataAt = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      out[name] = bytes.slice(dataAt, dataAt + csize);
      at += 46 + nlen + xlen + clen;
    }
    return out;
  };

  // ---- sources a drawing uses: a block or underlay is a copy of its source, kept in the version ----

  // The sources the items use, directly or through other sources. Each is kept once, however many blocks use it:
  //   { [sourceId]: { name, version, items } }, where version is the source's last change when it was copied.
  // sourceOf(id) returns a detail record or null. A source that is missing is left out, and reported by missingSources.
  SK.embedsOf = function (items, sourceOf) {
    var out = {};
    function walk(list) {
      (list || []).forEach(function (it) {
        if (it.kind !== 'block' || !it.sourceId || out[it.sourceId]) return;
        var src = sourceOf(it.sourceId);
        if (!src) return;
        out[it.sourceId] = { name: src.name, scale: src.scale, version: src.modified || src.created || 0, items: src.items || [] };
        walk(src.items);
      });
    }
    walk(items);
    return out;
  };

  // The embedded sources whose copy is no longer the source's current version, or which have been deleted.
  // Each flag is { sourceId, name, status: 'missing' | 'changed', embedded, current }. Nothing changes until someone acts on it.
  SK.embedFlags = function (embeds, sourceOf) {
    var flags = [];
    Object.keys(embeds).forEach(function (id) {
      var e = embeds[id];
      var src = sourceOf(id);
      if (!src) flags.push({ sourceId: id, name: e.name, status: 'missing', embedded: e.version, current: null });
      else if ((src.modified || src.created || 0) !== e.version) {
        flags.push({ sourceId: id, name: e.name, status: 'changed', embedded: e.version, current: src.modified || src.created || 0 });
      }
    });
    return flags;
  };

  // ---- restore points: the state of each lane at each fork it has, and at its end ----

  // The points of one lane: one per child fork (the scene the child was made from), and its last scene.
  // steps: SK.laneSteps(sessions) for the lane, in order. forks: the fork steps of the lane's children.
  // Returns [{ step, kind: 'fork' | 'end', sessionId, T }] where T is the time in that session at the end of the step.
  SK.pointPlan = function (steps, forks) {
    var out = [], seen = {};
    function add(step, kind) {
      if (step < 1 || step > steps.length || seen[step]) return;
      seen[step] = true;
      var st = steps[step - 1];
      out.push({ step: step, kind: kind, sessionId: st.sessionId, T: st.end });
    }
    (forks || []).forEach(function (f) { if (f != null) add(f, 'fork'); });
    if (steps.length) add(steps.length, 'end');
    return out.sort(function (a, b) { return a.step - b.step; });
  };

  // The file name of one point's picture, from its lane's address and its step: points/0-3-2.png for 0.3.2, step 2.
  SK.pointName = function (label, step) {
    return 'points/' + String(label).replace(/\./g, '-') + '-' + step + '.png';
  };

  // ---- the two JSON files ----

  // state: { lanes: [{ id, label, parentId, fork, name, points: [{ step, kind, items }] }], embeds }
  // manifest: the tree in words and numbers, with the notes and what was said at each step.
  SK.versionFiles = function (opts) {
    var now = new Date(opts.now || Date.now()).toISOString();
    // Only the drawing goes into state.json: pictures are files of their own in the ZIP.
    var state = {
      schema: SK.VERSION_SCHEMA,
      version: opts.version,
      saved: now,
      lanes: opts.lanes.map(function (l) {
        return {
          id: l.id, label: l.label, parentId: l.parentId || null, fork: l.fork || null, name: l.name, offset: l.offset || 0,
          points: l.points.map(function (p) { return { step: p.step, kind: p.kind, file: p.file, scale: p.scale, items: p.items }; })
        };
      }),
      embeds: opts.embeds || {}
    };
    var manifest = {
      schema: SK.VERSION_SCHEMA,
      version: opts.version,
      saved: now,
      root: opts.rootId,
      lanes: opts.lanes.map(function (l) {
        return {
          id: l.id, label: l.label, parentId: l.parentId || null, fork: l.fork || null, name: l.name, offset: l.offset || 0,
          steps: (l.stepNotes || []).map(function (sn) { return { step: sn.step, said: sn.said || '', notes: sn.notes || [] }; }),
          points: l.points.map(function (p) { return { step: p.step, kind: p.kind, file: p.file }; })
        };
      })
    };
    return {
      'state.json': new TextEncoder().encode(JSON.stringify(state)),
      'manifest.json': new TextEncoder().encode(JSON.stringify(manifest, null, 1))
    };
  };

  root.SK = SK;
  if (typeof module !== 'undefined' && module.exports) module.exports = SK;
})(typeof window !== 'undefined' ? window : globalThis);
