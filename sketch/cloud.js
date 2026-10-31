// Quick Detail — cloud sync to the Supabase "Architecture" project. Tables: sketch_details, sketch_recordings,
// sketch_snapshots, table_index. Media goes to the private bucket sketch-media.
//
// Only the planner (SK.cloudPlan) is pure and runs in Node. The client needs supabase-js and a signed-in owner;
// Row Level Security in the database refuses everyone else.
(function (root) {
  'use strict';

  var SK = root.SK || {};

  // Public values. The publishable key is meant for browsers; the database policies do the protecting.
  SK.CLOUD = {
    url: 'https://xabgankckrcuhcgdolrg.supabase.co',
    key: 'sb_publishable_kncKodoYJZ6ByexwWM_TtQ_OpW68M5f',
    bucket: 'sketch-media',
    library: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js'
  };

  function extOf(type) {
    if (!type) return 'webm';
    if (type.indexOf('mp4') >= 0) return 'm4a';
    if (type.indexOf('ogg') >= 0) return 'ogg';
    return 'webm';
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // Everything one detail needs in the cloud, with the storage path of each file. No I/O.
  //   detail:     the row for sketch_details
  //   recordings: rows for sketch_recordings (audio_path points at a file in the bucket)
  //   snapshots:  rows for sketch_snapshots (image_path points at a JPEG in the bucket)
  //   files:      { path, kind, sessionId?, sceneIndex? } for every file the upload must write
  //               (metadata.json, parallel.json with the JSON parallel of the drawing and its takes, audio, scene JPEGs)
  SK.cloudPlan = function (detail, sessions, an) {
    var base = detail.id + '/';
    var metaPath = base + 'metadata.json';
    var files = [{ path: metaPath, kind: 'metadata' }, { path: base + 'parallel.json', kind: 'parallel' }];
    var recordings = [];
    var snapshots = [];

    var detailRow = {
      local_id: detail.id,
      name: detail.name,
      scale: detail.scale,
      tags: detail.tags || [],
      items: detail.items,
      metadata: SK.detailMetadata(detail, an),
      parent_local_id: detail.parentId || null,
      updated_at: new Date(detail.modified || Date.now()).toISOString()
    };

    sessions.forEach(function (s) {
      var rp = base + s.id + '/';
      var audioPath = s.audio ? rp + 'audio.' + extOf(s.audio.type) : null;
      if (audioPath) files.push({ path: audioPath, kind: 'audio', sessionId: s.id });
      recordings.push({
        local_id: s.id,
        detail_local_id: detail.id,
        recorded_at: new Date(s.created).toISOString(),
        duration_ms: s.duration || 0,
        scale: s.scale || null,
        base: s.base,
        events: s.events,
        speech: s.speech || [],
        voice: s.voice || [],
        audio_offset_ms: s.audioOffset || 0,
        audio_path: audioPath,
        audio_type: s.audio ? s.audio.type : null
      });

      var scenes = an.scenes.filter(function (sc) { return sc.sessionId === s.id; });
      scenes.forEach(function (sc, i) {
        var imagePath = rp + 'scene-' + pad(i + 1) + '.jpg';
        files.push({ path: imagePath, kind: 'snapshot', sessionId: s.id, sceneIndex: sc.index });
        snapshots.push({
          local_id: s.id + '-' + sc.index,
          recording_local_id: s.id,
          detail_local_id: detail.id,
          scene_index: sc.index,
          start_ms: sc.start,
          end_ms: sc.end,
          said: sc.text || null,
          image_path: imagePath,
          metadata: SK.sceneMetadata(detail, an, sc, SK.stateAt(s, sc.end).map(function (it) { return it.id; }))
        });
      });
    });

    return { detail: detailRow, recordings: recordings, snapshots: snapshots, files: files, metadataPath: metaPath };
  };

  // ---------------------------------------------------------------
  // Client. Browser only: needs window.supabase (supabase-js) and a signed-in owner.
  // ---------------------------------------------------------------

  SK.Cloud = {
    client: null,

    ready: function () { return !!window.supabase; },

    init: function () {
      if (this.client) return this.client;
      if (!window.supabase) throw new Error('The cloud library did not load. Check the connection and try again.');
      this.client = window.supabase.createClient(SK.CLOUD.url, SK.CLOUD.key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      return this.client;
    },

    session: function () {
      return this.init().auth.getSession().then(function (r) { return r.data.session; });
    },

    // Sends a sign-in link to the email address. Only the owner's address can use the database.
    signIn: function (email) {
      return this.init().auth.signInWithOtp({
        email: email,
        options: { emailRedirectTo: location.href.split('#')[0], shouldCreateUser: true }
      });
    },

    // Password sign-in, for the owner account. The session is kept in this browser.
    signInWithPassword: function (email, password) {
      return this.init().auth.signInWithPassword({ email: email, password: password });
    },

    // Sends a password reset link. It returns to this page, so the Site URL and redirect URLs must allow it.
    resetPassword: function (email) {
      return this.init().auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] });
    },

    signOut: function () { return this.init().auth.signOut(); },

    // Writes one detail with its recordings, scene snapshots and media. Re-running updates the same rows.
    // media: { [path]: Blob } for every path in plan.files.
    upload: function (plan, media, progress) {
      var c = this.init();
      var note = function (msg) { if (progress) progress(msg); };
      var detailId, recMap = {};

      return c.from('sketch_details')
        .upsert(Object.assign({}, plan.detail, { parent_local_id: undefined }), { onConflict: 'local_id' })
        .select('id, local_id').single()
        .then(function (r) {
          if (r.error) throw r.error;
          detailId = r.data.id;
          note('Detail saved.');
          if (!plan.detail.parent_local_id) return null;
          return c.from('sketch_details').select('id').eq('local_id', plan.detail.parent_local_id).maybeSingle();
        })
        .then(function (parent) {
          if (!parent || !parent.data) return null;
          return c.from('sketch_details').update({ parent_id: parent.data.id }).eq('id', detailId);
        })
        .then(function () {
          var files = plan.files.filter(function (f) { return media[f.path]; });
          var i = 0;
          return files.reduce(function (p, f) {
            return p.then(function () {
              i++;
              note('Uploading ' + i + ' of ' + files.length + '.');
              return c.storage.from(SK.CLOUD.bucket).upload(f.path, media[f.path], {
                upsert: true,
                contentType: f.kind === 'audio' ? (media[f.path].type || 'audio/webm') : f.kind === 'snapshot' ? 'image/jpeg' : 'application/json'
              }).then(function (u) { if (u.error) throw u.error; });
            });
          }, Promise.resolve());
        })
        .then(function () {
          var rows = plan.recordings.map(function (r) {
            var row = Object.assign({}, r, { detail_id: detailId });
            delete row.detail_local_id;
            return row;
          });
          if (!rows.length) return [];
          return c.from('sketch_recordings').upsert(rows, { onConflict: 'local_id' }).select('id, local_id')
            .then(function (r) { if (r.error) throw r.error; return r.data; });
        })
        .then(function (recs) {
          recs.forEach(function (r) { recMap[r.local_id] = r.id; });
          var rows = plan.snapshots.map(function (s) {
            var row = Object.assign({}, s, { recording_id: recMap[s.recording_local_id], detail_id: detailId });
            delete row.recording_local_id;
            delete row.detail_local_id;
            return row;
          }).filter(function (row) { return row.recording_id; });
          if (!rows.length) return;
          return c.from('sketch_snapshots').upsert(rows, { onConflict: 'local_id' }).then(function (r) { if (r.error) throw r.error; });
        })
        .then(function () { note('Uploaded.'); return { detailId: detailId, recordings: Object.keys(recMap).length }; });
    },

    // Read side, for review.
    // The library: details that are not in the cloud recycle bin.
    details: function () {
      return this.init().from('sketch_details').select('id, local_id, name, scale, tags, items, created_at, updated_at, parent_id')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .then(function (r) { if (r.error) throw r.error; return r.data; });
    },

    // The cloud recycle bin: details moved to the bin, most recently deleted first.
    trashed: function () {
      return this.init().from('sketch_details').select('id, local_id, name, scale, tags, items, created_at, updated_at, deleted_at, parent_id')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })
        .then(function (r) { if (r.error) throw r.error; return r.data; });
    },

    // Moves a detail to the cloud recycle bin. Its files stay until it is deleted for good.
    softDelete: function (id) {
      return this.init().from('sketch_details').update({ deleted_at: new Date().toISOString() }).eq('id', id)
        .then(function (r) { if (r.error) throw r.error; });
    },

    // Takes a detail out of the cloud recycle bin.
    restore: function (id) {
      return this.init().from('sketch_details').update({ deleted_at: null }).eq('id', id)
        .then(function (r) { if (r.error) throw r.error; });
    },

    // Deletes one detail from the cloud for good: its media in the bucket, then its row, which takes its recordings and
    // snapshots with it (ON DELETE CASCADE). Media goes first, so a failure leaves the row in the bin and the delete can be retried.
    // row: a sketch_details row (needs id and local_id). The copy on this device is not touched.
    purge: function (row) {
      var c = this.init();
      var bucket = c.storage.from(SK.CLOUD.bucket);
      // Lists every file under a folder. Folders come back without an id; files come back with one.
      function filesUnder(path) {
        return bucket.list(path, { limit: 1000 }).then(function (r) {
          if (r.error) throw r.error;
          return Promise.all(r.data.map(function (e) {
            var p = path + '/' + e.name;
            return e.id ? [p] : filesUnder(p);
          }));
        }).then(function (parts) { return [].concat.apply([], parts); });
      }
      return filesUnder(row.local_id)
        .then(function (paths) {
          if (!paths.length) return null;
          return bucket.remove(paths).then(function (r) { if (r.error) throw r.error; });
        })
        .then(function () {
          return c.from('sketch_details').delete().eq('id', row.id)
            .then(function (r) { if (r.error) throw r.error; });
        });
    },

    recordingsOf: function (detailId) {
      return this.init().from('sketch_recordings')
        .select('id, local_id, recorded_at, duration_ms, audio_path, speech, voice')
        .eq('detail_id', detailId).order('recorded_at', { ascending: true })
        .then(function (r) { if (r.error) throw r.error; return r.data; });
    },

    snapshotsOf: function (detailId) {
      return this.init().from('sketch_snapshots')
        .select('id, recording_id, scene_index, start_ms, end_ms, said, image_path, metadata')
        .eq('detail_id', detailId).order('scene_index', { ascending: true })
        .then(function (r) { if (r.error) throw r.error; return r.data; });
    },

    // Rename a detail in the cloud. Only the owner's signed-in session can write.
    rename: function (id, name) {
      return this.init().from('sketch_details').update({ name: name, updated_at: new Date().toISOString() }).eq('id', id)
        .then(function (r) { if (r.error) throw r.error; });
    },

    signedUrl: function (path) {
      return this.init().storage.from(SK.CLOUD.bucket).createSignedUrl(path, 3600)
        .then(function (r) { if (r.error) throw r.error; return r.data.signedUrl; });
    }
  };

  root.SK = SK;
  if (typeof module !== 'undefined' && module.exports) module.exports = SK;
})(typeof window !== 'undefined' ? window : globalThis);
