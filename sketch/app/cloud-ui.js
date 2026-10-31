// Quick Detail app — Cloud library views.
// Sign-in form, the cloud list, the cloud recycle bin, opening a cloud detail here, its recordings,
// and building and sending an upload. The Supabase calls themselves are in sketch/cloud.js.
// Part of the app split across sketch/app/*.js. The parts share the page's global scope, so load order matters:
// see the <script> list in index.html and docs/code-map/index.html.
'use strict';

// ---------------- Cloud: sign in, review what was uploaded, see the table index ----------------

function signInForm() {
  var email = el('input', { type: 'email', placeholder: 'you@example.com', 'aria-label': 'Email', class: 'field', autocomplete: 'username' });
  var password = el('input', { type: 'password', placeholder: 'Password', 'aria-label': 'Password', class: 'field', autocomplete: 'current-password' });
  var inPassword = function () { return email.value.trim(); };
  var signIn = el('button', { class: 'btn primary', text: 'Sign in', on: { click: function () {
    var v = inPassword();
    if (!v || !password.value) { toast('Enter your email and password.'); return; }
    SK.Cloud.signInWithPassword(v, password.value).then(function (r) {
      if (r.error) throw r.error;
      password.value = '';
      toast('Signed in.');
      renderCloud();
    }).catch(function (e) { fail(e, 'Could not sign in: '); });
  } } });
  var forgot = el('button', { class: 'btn small', text: 'Forgot password', on: { click: function () {
    var v = inPassword();
    if (!v) { toast('Enter your email first.'); return; }
    SK.Cloud.resetPassword(v).then(function (r) {
      if (r.error) throw r.error;
      toast('If that address has an account, a reset link is on its way.');
    }).catch(function (e) { fail(e, 'Could not send the reset link: '); });
  } } });
  var link = el('button', { class: 'btn small', text: 'Email me a sign-in link', on: { click: function () {
    var v = inPassword();
    if (!v) { toast('Enter your email first.'); return; }
    SK.Cloud.signIn(v).then(function (r) {
      if (r.error) throw r.error;
      toast('Check your email. Open the link on this device to sign in.');
    }).catch(function (e) { fail(e, 'Could not send the link: '); });
  } } });
  return section('Sign in', [
    el('p', { class: 'muted', text: 'Uploads need a sign-in. Only the owner account can read or write the cloud tables.' }),
    el('div', { class: 'row' }, [email, password, signIn]),
    el('div', { class: 'row' }, [forgot, link])
  ]);
}

// Cloud collections: each tag is a collection, the same as the library on this device.
function renderCloud() {
  var body = $('libBody');
  body.innerHTML = '';
  $('libFilters').innerHTML = '';
  if (!SK.Cloud.ready()) {
    body.appendChild(el('p', { class: 'muted', text: 'The cloud library did not load. Check the connection. Drawings still save on this device.' }));
    return;
  }
  SK.Cloud.session().then(function (s) {
    if (!s) { body.appendChild(signInForm()); return; }
    var rows = lib.cloudRows ? Promise.resolve(lib.cloudRows) : SK.Cloud.details().then(function (l) { lib.cloudRows = l; return l; });
    return rows.then(function (list) {
      lib.sessions = {};
      var lead = el('div', { class: 'row' }, [
        el('span', { class: 'muted', text: 'Signed in. Tap a detail to open it on this device.' }),
        el('button', { class: 'btn small', text: 'Sign out', on: { click: function () { lib.cloudRows = null; SK.Cloud.signOut().then(renderCloud); } } })
      ]);
      showDetails(list.map(fromCloudRow), cloudCard, lead, 'Nothing uploaded yet. Open a detail, then Project info → Upload to cloud.');
    });
  }).catch(function (e) {
    fail(e, 'Could not reach the cloud: ');
    body.appendChild(el('p', { class: 'muted', text: 'Try again in a moment. Your drawings still save on this device.' }));
  });
}

// A cloud row as a detail, keyed by the id it has on the device it came from.
function fromCloudRow(r) {
  return {
    id: r.local_id, name: r.name, scale: r.scale, tags: r.tags || [], items: r.items || [],
    parentId: null, created: Date.parse(r.created_at || r.updated_at), modified: Date.parse(r.updated_at), cloud: r,
    rating: r.metadata && r.metadata.rating != null ? r.metadata.rating : null
  };
}

// Moves a detail from the cloud library to the cloud recycle bin. Its files stay until it is deleted for good from the bin.
// The copy on this device stays. "Don't ask for 5 minutes" is shared with the local bin.
function deleteFromCloud(d) {
  function go() {
    SK.Cloud.softDelete(d.cloud.id).then(function () {
      toast('Moved "' + d.name + '" to the cloud recycle bin.');
      lib.cloudRows = null;
      renderLibrary();
    }).catch(function (e) { fail(e, 'Could not move to the bin: '); });
  }
  if (Date.now() < recycleQuietUntil) { go(); return; }
  var back = null;
  function close() { if (back) back.remove(); }
  var card = el('div', { class: 'pop-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Move to the cloud recycle bin' }, [
    el('b', { text: 'Move "' + d.name + '" to the cloud recycle bin?' }),
    el('p', { class: 'muted', text: 'Its recordings go with it. You can restore it from Library → Recycle bin until you empty the cloud bin. The copy in this browser stays.' }),
    el('div', { class: 'row' }, [
      el('button', { class: 'btn danger', text: 'Move to bin', on: { click: function () { close(); go(); } } }),
      el('button', { class: 'btn', text: 'Don\'t ask for 5 minutes', on: { click: function () {
        recycleQuietUntil = Date.now() + 5 * 60 * 1000;
        close();
        go();
      } } }),
      el('button', { class: 'btn', text: 'Cancel', on: { click: close } })
    ])
  ]);
  back = el('div', { class: 'pop-back' }, [card]);
  document.body.appendChild(back);
  card.querySelector('.row .btn:last-child').focus();   // Cancel is the safe choice, so it has focus
}

// Deletes a detail from the cloud for good. Used by the cloud recycle bin only.
function purgeCloud(r) {
  return SK.Cloud.purge(r).then(function () { lib.cloudRows = null; toast('Deleted "' + r.name + '" from the cloud.'); });
}

function emptyCloudBin(rows) {
  if (!window.confirm('Empty the cloud recycle bin? ' + rows.length + (rows.length === 1 ? ' detail and its recordings' : ' details and their recordings') + ' will be deleted from the cloud for good.')) return;
  rows.reduce(function (p, r) { return p.then(function () { return SK.Cloud.purge(r); }); }, Promise.resolve())
    .then(function () { lib.cloudRows = null; toast('The cloud recycle bin is empty.'); renderBin(); })
    .catch(function (e) { fail(e, 'Could not empty the cloud bin: '); });
}

// The cloud recycle bin, listed under the local bin when this browser is signed in to the cloud.
function renderCloudBin(body) {
  if (!SK.Cloud.ready()) return;
  SK.Cloud.session().then(function (s) {
    if (!s) return;
    return SK.Cloud.trashed().then(function (rows) {
      body.appendChild(el('h3', { text: 'Cloud recycle bin · ' + rows.length }));
      if (!rows.length) { body.appendChild(el('p', { class: 'muted', text: 'The cloud bin is empty.' })); return; }
      body.appendChild(el('div', { class: 'row bin-head' }, [
        el('p', { class: 'muted', text: rows.length + (rows.length === 1 ? ' detail' : ' details') + ' in the cloud bin. Restore them, or delete them for good from the cloud.' }),
        el('button', { class: 'btn danger', text: 'Empty cloud bin', on: { click: function () { emptyCloudBin(rows); } } })
      ]));
      rows.forEach(function (r) {
        body.appendChild(el('article', { class: 'bin-row' }, [
          el('b', { text: r.name }),
          el('span', { class: 'muted', text: 'Deleted ' + dateOf(Date.parse(r.deleted_at)) + ' · ' + (r.items || []).length + ' elements' }),
          el('div', { class: 'row' }, [
            el('button', { class: 'btn', text: 'Restore', on: { click: function () {
              SK.Cloud.restore(r.id).then(function () {
                toast('Restored "' + r.name + '" from the cloud bin.');
                lib.cloudRows = null;
                renderBin();
              }).catch(function (e) { fail(e, 'Could not restore: '); });
            } } }),
            el('button', { class: 'btn danger', text: 'Delete for good', on: { click: function () {
              if (window.confirm('Delete "' + r.name + '" from the cloud for good? Its recordings and scene pictures go too. This cannot be undone.')) purgeCloud(r).then(renderBin).catch(function (e) { fail(e, 'Could not delete: '); });
            } } })
          ])
        ]));
      });
    });
  }).catch(function (e) { fail(e, 'Could not read the cloud bin: '); });
}

// Open a cloud detail on this device. A copy already here is kept unless the cloud one is newer and you agree.
function openCloudDetail(d) {
  SK.DB.get('details', d.id).then(function (mine) {
    var use = mine;
    if (!mine) use = d;
    else if (d.modified > mine.modified && window.confirm('This browser has an older copy of "' + d.name + '". Replace it with the cloud version?')) use = Object.assign({}, mine, d);
    var copy = { id: use.id, name: use.name, scale: use.scale, tags: use.tags, items: use.items, parentId: use.parentId || null, created: use.created, modified: use.modified };
    var save = use === mine ? Promise.resolve() : saveDetail(copy, [], null);
    return save.then(function () {
      closeLibrary();
      return openDetail(use === mine ? mine : copy);
    });
  }).catch(function (e) { fail(e, 'Could not open: '); });
}

function renderCloudDetail(d) {
  var body = $('libBody');
  body.innerHTML = '';
  body.appendChild(el('div', { class: 'row' }, [
    el('button', { class: 'btn small', text: '← All uploads', on: { click: renderCloud } }),
    el('b', { text: d.name })
  ]));
  Promise.all([SK.Cloud.recordingsOf(d.id), SK.Cloud.snapshotsOf(d.id)]).then(function (r) {
    var recs = r[0], snaps = r[1];
    if (!recs.length) body.appendChild(el('p', { class: 'muted', text: 'No recordings uploaded for this detail yet.' }));
    return Promise.all(recs.map(function (rec) {
      var mine = snaps.filter(function (s) { return s.recording_id === rec.id; });
      var audio = rec.audio_path ? SK.Cloud.signedUrl(rec.audio_path).then(function (u) {
        return el('audio', { controls: true, preload: 'none', src: u });
      }) : Promise.resolve(el('span', { class: 'muted', text: 'No sound in this recording.' }));
      return audio.then(function (player) {
        return el('article', { class: 'rec-review' }, [
          el('b', { text: new Date(rec.recorded_at).toLocaleString() + ' · ' + SK.formatTime(rec.duration_ms) + ' · ' + mine.length + (mine.length === 1 ? ' scene' : ' scenes') }),
          player,
          el('div', { class: 'snaps' }, mine.map(snapCard))
        ]);
      });
    })).then(function (boxes) { boxes.forEach(function (b) { body.appendChild(b); }); });
  }).catch(function (e) { fail(e, 'Could not open: '); });
}

function snapCard(s) {
  var img = el('img', { alt: 'Scene ' + s.scene_index });
  SK.Cloud.signedUrl(s.image_path).then(function (u) { img.src = u; }).catch(function () {});
  var words = s.said ? ' · ' + SK.firstWords(s.said, 10) : '';
  return el('figure', { class: 'snap' }, [img, el('figcaption', { text: 'Scene ' + s.scene_index + ' · ' + SK.formatTime(s.start_ms) + words })]);
}

// Everything one upload needs: the plan, and the media behind each path (audio, scene pictures, metadata).
function buildUpload() {
  var an = analysis();
  var plan = SK.cloudPlan(detail, sessions, an);
  var media = {};
  var jobs = [];
  plan.files.forEach(function (f) {
    if (f.kind === 'metadata') {
      media[f.path] = new Blob([JSON.stringify(SK.detailMetadata(detail, an), null, 1)], { type: 'application/json' });
      return;
    }
    if (f.kind === 'parallel') {
      media[f.path] = new Blob([JSON.stringify(parallelOf(detail, sessions, null), null, 1)], { type: 'application/json' });
      return;
    }
    var s = sessions.filter(function (x) { return x.id === f.sessionId; })[0];
    if (f.kind === 'audio') { media[f.path] = s.audio; return; }
    var sc = an.scenes.filter(function (x) { return x.sessionId === f.sessionId && x.index === f.sceneIndex; })[0];
    var items = SK.stateAt(s, sc.end);
    var b = SK.itemsBounds(visible(SK.printable(items)), ac()) || SK.itemsBounds(visible(SK.printable(detail.items)), ac());
    if (!b) return;
    jobs.push(new Promise(function (resolve) {
      sheetCanvas(items, b, detail).toBlob(function (blob) { media[f.path] = blob; resolve(); }, 'image/jpeg', 0.9);
    }));
  });
  return Promise.all(jobs).then(function () { return { plan: plan, media: media }; });
}

function uploadToCloud() {
  if (take) stopRecording();
  SK.Cloud.session().then(function (s) {
    if (!s) {
      toast('Sign in first. Open Library → Cloud to get the link.');
      lib.view = 'cloud';
      openLibrary();
      return null;
    }
    toast('Preparing the upload…');
    return buildUpload().then(function (u) {
      return SK.Cloud.upload(u.plan, u.media, toast).then(function (res) {
        toast('Uploaded "' + detail.name + '": ' + res.recordings + (res.recordings === 1 ? ' recording.' : ' recordings.'));
      });
    });
  }).catch(function (e) { fail(e, 'Upload failed: '); });
}
