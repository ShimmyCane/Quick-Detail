// Quick Detail app — Library card popup.
// The popup a catalogue card opens: picture (plays a GIF), rename, facts and actions.
// Also PNG and GIF downloads, cloud scene frames, and duplicating a detail.
// Part of the app split across sketch/app/*.js. The parts share the page's global scope, so load order matters:
// see the <script> list in index.html and docs/code-map/index.html.
'use strict';

// The card a catalogue card opens. Picture (click to play the scenes as a GIF), title (click to rename),
// description (the last words recorded), compact info, and the actions. The × in the corner closes it.
function showDetailInfo(d, fromCloud) {
  var a = acFor(d), col = libColors();
  var sess = lib.sessions[d.id] || [];
  var scenes = SK.scenesOf(sess);
  var recorded = sess.reduce(function (n, s) { return n + (s.duration || 0); }, 0);
  var users = SK.usersOf(d.id, allDetails).length;
  var inHere = d.id === detail.id;
  var back = null;
  var gif = null;   // the GIF player for the picture, stopped when the card closes
  function close() { if (gif) gif.stop(); if (back) back.remove(); }

  var pic = cardPicture(d.items, cardBounds(d.items, a), a, col);
  pic.className = 'info-pic';
  pic.setAttribute('role', 'button');
  pic.setAttribute('tabindex', '0');
  pic.title = 'Click to play the scenes as a GIF';
  gif = playerFor(pic, d, fromCloud);
  pic.addEventListener('click', gif.toggle);
  pic.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); gif.toggle(); } });

  var title = el('b', { class: 'info-title', text: d.name, title: 'Click to rename', tabindex: '0' });
  function beginRename() {
    var input = el('input', { class: 'field info-name', value: d.name, 'aria-label': 'Name' });
    title.replaceWith(input);
    input.focus();
    input.select();
    var done = false;
    function finish(save) {
      if (done) return;
      done = true;
      var name = input.value.trim();
      if (save && name && name !== d.name) { close(); renameDetail(d, name, fromCloud); return; }
      input.replaceWith(title);
    }
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', function () { finish(true); });
  }
  title.addEventListener('click', beginRename);
  title.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); beginRename(); } });

  var last = scenes.length ? scenes[scenes.length - 1].text : '';
  var facts = [];
  if (!fromCloud) facts.push(scenes.length + (scenes.length === 1 ? ' scene' : ' scenes') + ' · ' + sess.length + (sess.length === 1 ? ' recording' : ' recordings') + ' · ' + SK.formatTime(recorded));
  facts.push(d.items.length + ' elements · ' + SK.scaleOf(d.scale).label);
  facts.push('Edited ' + dateOf(d.modified) + (d.created ? ' · Created ' + dateOf(d.created) : ''));
  if (users) facts.push('Used in ' + users + (users === 1 ? ' block' : ' blocks'));
  if (isBlockDetail(d)) facts.push('A block: tick it in a detail\'s Blocks checklist to add it there.');

  function action(text, fn, title) { return el('button', { class: 'btn', text: text, title: title || text, on: { click: fn } }); }
  var actions = [
    action('Open', function () {
      close();
      if (fromCloud) { openCloudDetail(d); return; }
      closeLibrary();
      openDetail(d);
    }),
    action('Insert as block', function () {
      if (inHere) { toast('This is the open detail. Open another one to insert it as a block.'); return; }
      close();
      closeLibrary();
      (fromCloud ? localCopyOf(d) : Promise.resolve(d)).then(addBlock).catch(fail);
    }),
    action('Duplicate', function () {
      close();
      (fromCloud ? localCopyOf(d) : Promise.resolve(d)).then(duplicateDetail).catch(fail);
    }),
    action('PNG', function () { downloadPng(d); }, 'Download the drawing as a PNG'),
    action('GIF', function () { downloadGif(d, fromCloud); }, 'Download a GIF of this detail\'s recordings')
  ];
  if (fromCloud) actions.push(action('Recordings', function () { close(); renderCloudDetail(d.cloud); }, 'See the recordings uploaded for this detail'));

  back = el('div', { class: 'pop-back', on: { click: function (e) { if (e.target === back) close(); } } });
  var card = el('div', { class: 'pop-card info-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': d.name }, [
    el('button', { class: 'pop-x', text: '×', title: 'Close', 'aria-label': 'Close', on: { click: close } }),
    pic,
    title,
    el('p', { class: 'said info-desc', text: last ? SK.firstWords(last, 24) : 'No words recorded yet.' }),
    el('p', { class: 'tags-line', text: detailTags(d).join(' · ') || 'no tags yet' }),
    ratingRow(d, fromCloud),
    el('ul', { class: 'info-facts' }, facts.map(function (f) { return el('li', { class: 'muted', text: f }); })),
    el('div', { class: 'row info-actions' }, actions)
  ]);
  back.appendChild(card);
  document.body.appendChild(back);
  card.querySelector('.info-actions .btn').focus();
}

// Plays a detail's scenes in the picture, one after another, and stops. Returns { toggle, stop }.
function playerFor(pic, d, fromCloud) {
  var still = document.createElement('canvas');
  still.width = pic.width;
  still.height = pic.height;
  still.getContext('2d').drawImage(pic, 0, 0);
  var timer = 0, frames = null, i = 0, loading = false;
  function draw(k) {
    var g = pic.getContext('2d');
    g.clearRect(0, 0, pic.width, pic.height);
    g.drawImage(frames[k].canvas, 0, 0, pic.width, pic.height);
  }
  function stop() {
    clearInterval(timer);
    timer = 0;
    pic.classList.remove('playing');
    var g = pic.getContext('2d');
    g.clearRect(0, 0, pic.width, pic.height);
    g.drawImage(still, 0, 0);
  }
  function toggle() {
    if (timer) { stop(); return; }
    if (loading) return;
    loading = true;
    (fromCloud ? cloudFrames(d) : framesFor(d)).then(function (fr) {
      loading = false;
      if (!fr.length) { toast('Nothing to play yet. Record a scene, or draw a few lines.'); return; }
      frames = fr;
      i = 0;
      draw(0);
      pic.classList.add('playing');
      timer = setInterval(function () { i = (i + 1) % frames.length; draw(i); }, 300);
    }).catch(function (e) { loading = false; fail(e, 'Could not play: '); });
  }
  return { toggle: toggle, stop: stop };
}

// The drawing as a PNG, at a size that reads on a screen.
function downloadPng(d) {
  var a = acFor(d), col = libColors();
  SK.whenImages(visible(d.items)).then(function () {
    var c = SK.picture(visible(SK.printable(d.items)), cardBounds(d.items, a), 1200, 800, { ac: a, ink: col.ink, paper: col.paper, mono: col.mono, print: true });
    c.toBlob(function (blob) { download(blob, slug(d.name) + '.png'); }, 'image/png');
  }).catch(function (e) { fail(e, 'Could not make the PNG: '); });
}

// Rename a detail from the library. A cloud card renames the cloud copy, and the local copy too when this device has one.
function renameDetail(d, name, fromCloud) {
  function done() {
    toast('Renamed to "' + name + '".');
    lib.cloudRows = null;
    renderLibrary();
  }
  function local() {
    if (detail && detail.id === d.id) {   // the open detail is edited in memory, so change it there and save it
      detail.name = name;
      detail.modified = Date.now();
      updateTitle();
      return saveNow();
    }
    return SK.DB.get('details', d.id).then(function (mine) {
      if (!mine) return;
      mine.name = name;
      mine.modified = Date.now();
      return SK.DB.put('details', mine).then(function () { cacheDetail(mine); });
    });
  }
  var job = fromCloud ? SK.Cloud.rename(d.cloud.id, name).then(local) : local();
  job.then(done).catch(function (e) { fail(e, 'Could not rename: '); });
}

// Cloud scenes: the scene JPEG of each uploaded recording, in recording order. A cloud card has no local sessions to replay.
function cloudFrames(d) {
  var id = d.cloud.id;
  return Promise.all([SK.Cloud.recordingsOf(id), SK.Cloud.snapshotsOf(id)]).then(function (r) {
    var ordered = [];
    r[0].forEach(function (rec) {
      r[1].filter(function (s) { return s.recording_id === rec.id; }).forEach(function (s) { ordered.push(s); });
    });
    return Promise.all(ordered.map(function (s) {
      return SK.Cloud.signedUrl(s.image_path).then(loadPicture).then(function (img) {
        var c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        return { canvas: c };
      });
    }));
  });
}

function loadPicture(url) {
  return new Promise(function (resolve, reject) {
    var img = new Image();
    img.crossOrigin = 'anonymous';   // so the canvas can be read back for the GIF
    img.onload = function () { resolve(img); };
    img.onerror = function () { reject(new Error('a scene picture did not load')); };
    img.src = url;
  });
}

// A GIF of a detail's recordings: one frame per scene, at the same pace as the hold-to-flip preview.
// A local detail with no recordings gets its build-up frames instead. Local frames are drawn at twice size so the file
// reads on a screen; cloud scene JPEGs are capped at 900 px wide, since they are full sheets.
function downloadGif(d, fromCloud) {
  var GIF_FRAME_MS = 300;
  (fromCloud ? cloudFrames(d) : framesFor(d)).then(function (frames) {
    if (!frames.length) { toast('Nothing to animate yet. Record a scene, or draw a few lines.'); return; }
    toast('Making the GIF…');
    // Every frame is drawn at the last frame's size, since a GIF has one size and a drawing grows as it is built.
    var last = frames[frames.length - 1].canvas;
    var k = fromCloud ? Math.min(1, 900 / last.width) : 2;
    var W = Math.round(last.width * k), H = Math.round(last.height * k);
    var pics = frames.map(function (f) {
      var c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      var g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(f.canvas, 0, 0, W, H);
      var px = g.getImageData(0, 0, c.width, c.height);
      return { width: c.width, height: c.height, data: px.data };
    });
    var bytes = SK.encodeGif(pics, GIF_FRAME_MS);
    download(new Blob([bytes], { type: 'image/gif' }), slug(d.name) + '.gif');
    toast('Saved "' + slug(d.name) + '.gif".');
  }).catch(function (e) { fail(e, 'Could not make the GIF: '); });
}

// A copy with the same lines, tags and scale. Its recordings stay with the original. Blocks in it still link to their sources.
function duplicateDetail(d) {
  var c = newDetail(d.name + ' copy');
  c.scale = d.scale;
  c.tags = (d.tags || []).slice();
  c.items = clone(d.items);
  saveDetail(c, [], null).then(function () {
    toast('Duplicated as "' + c.name + '". The original is unchanged.');
    renderLibrary();
  }).catch(fail);
}
