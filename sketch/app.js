// Sketch — the page: a blank sheet, recording (strokes, sound, speech) and playback of recordings.
(function () {
  'use strict';

  var SK = window.SK;
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('sheet');
  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;

  var sheet = [];          // the live drawing: strokes in order
  var drawing = null;      // the stroke under the pen right now
  var drawingPointer = null;
  var liveInk = '#1d1d1f';
  var rec = null;          // the recording in progress
  var starting = false;
  var stopping = false;
  var pb = null;           // the recording being played back
  var penSeen = false;
  var counter = 0;
  var saveTimer = 0;
  var recTimer = 0;
  var toastTimer = 0;

  function W() { return window.innerWidth; }
  function H() { return window.innerHeight; }
  function newId(prefix) { counter++; return (prefix || 's') + Date.now().toString(36) + counter.toString(36); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function round(n) { return Math.round(n * 1e5) / 1e5; }

  function palette() {
    var cs = getComputedStyle(document.documentElement);
    return {
      ink: cs.getPropertyValue('--ink').trim() || '#1d1d1f',
      paper: cs.getPropertyValue('--paper').trim() || '#fbfaf7'
    };
  }

  // Milliseconds since a recording started (0 when none is running). Pass a pointer timeStamp to time an old event.
  function since(r, ts) { return Math.max(0, Math.round((ts == null ? performance.now() : ts) - r.t0)); }
  function nowRel(ts) { return rec ? since(rec, ts) : 0; }

  // ===================================================================
  // Storage: IndexedDB. Recordings hold audio, so localStorage is too small.
  // ===================================================================

  var DB = (function () {
    var opened = null;
    function open() {
      if (!opened) opened = new Promise(function (resolve, reject) {
        var req = indexedDB.open('sketch', 1);
        req.onupgradeneeded = function () {
          req.result.createObjectStore('sessions', { keyPath: 'id' });
          req.result.createObjectStore('kv');
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
    return {
      put: function (store, value, key) {
        return run(store, 'readwrite', function (s) { return key === undefined ? s.put(value) : s.put(value, key); });
      },
      get: function (store, key) { return run(store, 'readonly', function (s) { return s.get(key); }); },
      all: function (store) { return run(store, 'readonly', function (s) { return s.getAll(); }); },
      del: function (store, key) { return run(store, 'readwrite', function (s) { return s.delete(key); }); }
    };
  })();

  function saveSheetSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      DB.put('kv', clone(sheet), 'sheet').catch(function (err) { fail(err, 'Could not save the sheet: '); });
    }, 300);
  }

  // ===================================================================
  // Drawing
  // ===================================================================

  // Width of a stroke in sheet units, from the pressure along it.
  function strokeWidth(s) {
    var sum = 0;
    s.pts.forEach(function (p) { sum += p[2]; });
    return 1.2 + 2 * (sum / s.pts.length);
  }

  // Paints strokes. px is pixels per sheet unit; lw scales the line weight (thumbnails use less).
  function drawStrokes(c, strokes, px, lw, col) {
    c.strokeStyle = col.ink;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    strokes.forEach(function (s) {
      var p = s.pts;
      if (!p.length) return;
      c.lineWidth = strokeWidth(s) * lw;
      c.beginPath();
      c.moveTo(p[0][0] * px, p[0][1] * px);
      if (p.length === 1) c.lineTo(p[0][0] * px + 0.1, p[0][1] * px);
      for (var i = 1; i < p.length - 1; i++) {
        c.quadraticCurveTo(p[i][0] * px, p[i][1] * px,
          (p[i][0] + p[i + 1][0]) / 2 * px, (p[i][1] + p[i + 1][1]) / 2 * px);
      }
      if (p.length > 1) {
        var last = p[p.length - 1];
        c.lineTo(last[0] * px, last[1] * px);
      }
      c.stroke();
    });
  }

  function redraw() {
    var col = palette();
    liveInk = col.ink;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = col.paper;
    ctx.fillRect(0, 0, W(), H());
    drawStrokes(ctx, pb ? pb.sheet : sheet, W(), 1, col);
  }

  // While the pen moves, only the newest piece is painted. The full stroke is repainted on pen up.
  function drawPiece(a, b) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = liveInk;
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.2 + 2 * b[2];
    ctx.beginPath();
    ctx.moveTo(a[0] * W(), a[1] * W());
    ctx.lineTo(b[0] * W() + 0.01, b[1] * W());
    ctx.stroke();
  }

  function resize() {
    canvas.width = Math.round(W() * dpr);
    canvas.height = Math.round(H() * dpr);
    redraw();
  }

  // Adds the pointer position to the stroke. Returns false when the point is too close to the last one.
  function addPoint(e) {
    var x = e.clientX / W(), y = e.clientY / W();
    var pts = drawing.pts;
    var last = pts[pts.length - 1];
    if (last && Math.hypot((x - last[0]) * W(), (y - last[1]) * W()) < 1.5) return false;
    var pressure = e.pressure > 0 ? e.pressure : 0.5;
    pts.push([round(x), round(y), round(pressure), nowRel(e.timeStamp) - drawing.t0]);
    return true;
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (pb) return;
    if (e.pointerType === 'pen') penSeen = true;
    if (e.pointerType === 'touch' && penSeen) return;        // a finger resting while the pen is in use
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    closeDrawer();
    canvas.setPointerCapture(e.pointerId);
    drawingPointer = e.pointerId;
    drawing = { id: newId(), t0: nowRel(e.timeStamp), pts: [] };
    sheet.push(drawing);
    addPoint(e);
    var p0 = drawing.pts[0];
    drawPiece(p0, p0);
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!drawing || e.pointerId !== drawingPointer) return;
    var list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    if (!list.length) list = [e];
    list.forEach(function (ev) {
      var before = drawing.pts[drawing.pts.length - 1];
      if (addPoint(ev) && before) drawPiece(before, drawing.pts[drawing.pts.length - 1]);
    });
  });

  function endStroke(e) {
    if (!drawing || e.pointerId !== drawingPointer) return;
    var s = drawing;
    drawing = null;
    drawingPointer = null;
    if (rec) rec.events.push({ t: s.t0, type: 'add', stroke: s });
    redraw();
    saveSheetSoon();
  }
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);

  function undo() {
    if (pb || drawing || !sheet.length) return;
    var s = sheet.pop();
    if (rec) rec.events.push({ t: nowRel(), type: 'undo', id: s.id });
    redraw();
    saveSheetSoon();
  }

  function clearSheet() {
    if (pb || !sheet.length) return;
    if (!window.confirm('Clear the sheet? Saved recordings keep their drawings.')) return;
    sheet = [];
    if (rec) rec.events.push({ t: nowRel(), type: 'clear' });
    redraw();
    saveSheetSoon();
    closeDrawer();
  }

  // ===================================================================
  // Recording: pen strokes, microphone and speech, all on one clock
  // ===================================================================

  function audioOptions() {
    if (!window.MediaRecorder) return null;
    var types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    for (var i = 0; i < types.length; i++) {
      if (MediaRecorder.isTypeSupported(types[i])) return { mimeType: types[i] };
    }
    return {};
  }

  function startSpeech(r) {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    var recog = new SR();
    recog.continuous = true;
    recog.interimResults = false;
    recog.lang = navigator.language || 'en-US';
    recog.onresult = function (e) {
      for (var i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal) continue;
        var text = e.results[i][0].transcript.trim();
        if (text) r.speech.push({ t: since(r), text: text });
      }
    };
    recog.onend = function () {
      if (r.live) { try { recog.start(); } catch (_) { /* already running */ } }
    };
    recog.onerror = function (e) {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        r.live = false;
        toast('Speech text is blocked by the browser. Drawing and sound still record.');
      }
    };
    r.recog = recog;
    try { recog.start(); } catch (_) { /* already running */ }
  }

  async function startRecording() {
    if (rec || starting || stopping || drawing) return;
    starting = true;
    try {
      if (pb) exitPlayback();
      var stream = null;
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
        catch (err) { toast('No microphone access. This recording will have drawing only.'); }
      }
      // The sheet is copied after the microphone is ready, so nothing drawn during the wait is lost or doubled.
      var r = {
        t0: performance.now(),
        base: clone(sheet.filter(function (s) { return s !== drawing; })),
        events: [],
        speech: [],
        stream: stream,
        recorder: null,
        chunks: [],
        recog: null,
        live: true
      };
      var opts = stream ? audioOptions() : null;
      if (opts) {
        r.recorder = new MediaRecorder(stream, opts.mimeType ? opts : undefined);
        r.recorder.ondataavailable = function (e) { if (e.data && e.data.size) r.chunks.push(e.data); };
        r.recorder.start(1000);
      }
      rec = r;
      startSpeech(r);
      showRecording(true);
    } finally {
      starting = false;
    }
  }

  async function stopRecording() {
    var r = rec;
    if (!r || stopping) return;
    stopping = true;
    try {
      r.live = false;
      if (r.recog) {
        await new Promise(function (done) {
          r.recog.onend = done;
          setTimeout(done, 1500);            // speech sometimes sends its last words after stop()
          try { r.recog.stop(); } catch (_) { done(); }
        });
      }
      var duration = Math.round(performance.now() - r.t0);

      var audio = null;
      if (r.recorder) {
        if (r.recorder.state !== 'inactive') {
          await new Promise(function (done) {
            r.recorder.onstop = done;
            r.recorder.stop();
          });
        }
        audio = new Blob(r.chunks, { type: r.recorder.mimeType || 'audio/webm' });
      }
      if (r.stream) r.stream.getTracks().forEach(function (t) { t.stop(); });

      rec = null;
      showRecording(false);

      var session = {
        id: newId('r'),
        title: SK.defaultTitle(new Date()),
        created: Date.now(),
        duration: duration,
        base: r.base,
        events: r.events,
        speech: r.speech,
        audio: audio && audio.size ? audio : null
      };
      await DB.put('sessions', session);
      var n = SK.segment(session).length;
      toast('Saved. ' + n + (n === 1 ? ' moment.' : ' moments.'));
      renderSessions();
    } catch (err) {
      rec = null;
      showRecording(false);
      fail(err, 'Could not save the recording: ');
    } finally {
      stopping = false;
    }
  }

  function toggleRecord() {
    if (rec) stopRecording();
    else startRecording();
  }

  function showRecording(on) {
    $('recBtn').textContent = on ? 'Stop' : 'Record';
    $('recDot').hidden = !on;
    clearInterval(recTimer);
    if (on) {
      recTimer = setInterval(function () { $('recTime').textContent = SK.formatTime(nowRel()); }, 250);
      $('recTime').textContent = '00:00';
    }
  }

  // ===================================================================
  // Recordings list
  // ===================================================================

  function renderSessions() {
    DB.all('sessions').then(function (list) {
      list.sort(function (a, b) { return b.created - a.created; });
      var ul = $('sessionList');
      ul.innerHTML = '';
      if (!list.length) {
        ul.innerHTML = '<li class="muted">No recordings yet. Press Record, then draw and talk.</li>';
        return;
      }
      list.forEach(function (s) {
        var n = SK.segment(s).length;
        var li = document.createElement('li');
        li.innerHTML = '<div class="meta"><b></b><span></span></div>' +
          '<button class="btn" data-play data-id="' + s.id + '">Replay</button>' +
          '<button class="btn" data-del data-id="' + s.id + '">Delete</button>';
        li.querySelector('b').textContent = s.title;
        li.querySelector('span').textContent = SK.formatTime(s.duration) + ' · ' +
          n + (n === 1 ? ' moment' : ' moments') + (s.audio ? '' : ' · no sound');
        ul.appendChild(li);
      });
    }).catch(function (err) { fail(err, 'Could not list recordings: '); });
  }

  $('sessionList').addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    var id = btn.getAttribute('data-id');
    if (btn.hasAttribute('data-play')) openSession(id);
    else if (btn.hasAttribute('data-del')) deleteSession(id);
  });

  function deleteSession(id) {
    if (!window.confirm('Delete this recording? This cannot be undone.')) return;
    DB.del('sessions', id)
      .then(function () {
        if (pb && pb.session.id === id) exitPlayback();
        renderSessions();
      })
      .catch(function (err) { fail(err, 'Could not delete: '); });
  }

  // ===================================================================
  // Playback: the drawing is replayed stroke by stroke, with the sound, and the moments are linked to it
  // ===================================================================

  // A small picture of the sheet at the end of a moment. Made once per moment and kept.
  function thumbFor(session, m) {
    if (m.thumb) return m.thumb;
    var tw = 220;
    var th = Math.round(tw * H() / W());
    var c = document.createElement('canvas');
    c.width = tw;
    c.height = th;
    var g = c.getContext('2d');
    var col = palette();
    g.fillStyle = col.paper;
    g.fillRect(0, 0, tw, th);
    drawStrokes(g, SK.stateAt(session, m.end), tw, 0.5, col);
    m.thumb = c.toDataURL('image/png');
    return m.thumb;
  }

  async function openSession(id) {
    if (rec || stopping || starting) { toast('Stop recording first.'); return; }
    var s = await DB.get('sessions', id).catch(function (err) { fail(err, 'Could not open: '); return null; });
    if (!s) return;
    closeDrawer();
    exitPlayback();
    pb = {
      session: s,
      moments: SK.segment(s),
      T: 0,
      sheet: [],
      playing: false,
      startT: 0,
      startedAt: 0,
      raf: 0,
      current: -1,
      url: null,
      audio: null
    };
    if (s.audio) {
      pb.url = URL.createObjectURL(s.audio);
      pb.audio = new Audio(pb.url);
      pb.audio.preload = 'auto';
    }
    $('scrub').max = s.duration;
    buildMoments();
    $('player').hidden = false;
    document.body.classList.add('playing');
    seekTo(0);
  }

  function buildMoments() {
    var ol = $('moments');
    ol.innerHTML = '';
    if (!pb.moments.length) {
      ol.innerHTML = '<li class="muted">Nothing was drawn or said in this recording.</li>';
      return;
    }
    pb.moments.forEach(function (m) {
      var li = document.createElement('li');
      li.innerHTML = '<img alt=""><b></b><p></p>';
      li.querySelector('img').src = thumbFor(pb.session, m);
      li.querySelector('b').textContent = SK.formatTime(m.start) + ' – ' + SK.formatTime(m.end);
      li.querySelector('p').textContent = m.text || '(drawing only)';
      li.addEventListener('click', function () {
        seekTo(m.start);
        startPlay();
      });
      ol.appendChild(li);
    });
  }

  // Moves the picture to time T without touching the sound (used while playing).
  function setT(T) {
    pb.T = Math.max(0, Math.min(T, pb.session.duration));
    pb.sheet = SK.stateAt(pb.session, pb.T);
    redraw();
    updatePlayerUi();
  }

  // Jumps to time T, the sound included (used by the scrubber and moment links).
  function seekTo(T) {
    setT(T);
    pb.startT = pb.T;
    pb.startedAt = performance.now();
    if (pb.audio) pb.audio.currentTime = pb.T / 1000;
  }

  function startPlay() {
    if (!pb || pb.playing) return;
    if (pb.T >= pb.session.duration) seekTo(0);
    pb.playing = true;
    pb.startT = pb.T;
    pb.startedAt = performance.now();
    if (pb.audio) pb.audio.play().catch(function () { /* the picture still plays without sound */ });
    pb.raf = requestAnimationFrame(frame);
    updatePlayerUi();
  }

  function pausePlay() {
    if (!pb || !pb.playing) return;
    pb.playing = false;
    cancelAnimationFrame(pb.raf);
    if (pb.audio) pb.audio.pause();
    updatePlayerUi();
  }

  function togglePlay() {
    if (!pb) return;
    if (pb.playing) pausePlay();
    else startPlay();
  }

  function frame() {
    if (!pb || !pb.playing) return;
    var T = pb.startT + (performance.now() - pb.startedAt);
    if (T >= pb.session.duration) {
      setT(pb.session.duration);
      pausePlay();
      return;
    }
    setT(T);
    pb.raf = requestAnimationFrame(frame);
  }

  function updatePlayerUi() {
    if (!pb) return;
    $('scrub').value = Math.round(pb.T);
    $('clock').textContent = SK.formatTime(pb.T) + ' / ' + SK.formatTime(pb.session.duration);
    $('playBtn').textContent = pb.playing ? '❚❚' : '▶';
    $('playBtn').setAttribute('aria-label', pb.playing ? 'Pause' : 'Play');

    var cur = -1;
    pb.moments.forEach(function (m, i) { if (m.start <= pb.T) cur = i; });
    if (cur !== pb.current) {
      pb.current = cur;
      var items = $('moments').children;
      for (var i = 0; i < items.length; i++) items[i].classList.toggle('on', i === cur);
      if (items[cur]) items[cur].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function exitPlayback() {
    if (!pb) return;
    pausePlay();
    if (pb.url) URL.revokeObjectURL(pb.url);
    pb = null;
    $('player').hidden = true;
    document.body.classList.remove('playing');
    redraw();
  }

  // ===================================================================
  // Settings drawer, keys, toast
  // ===================================================================

  function openDrawer() {
    $('drawer').hidden = false;
    renderSessions();
  }
  function closeDrawer() { $('drawer').hidden = true; }

  $('gear').addEventListener('click', function () {
    if ($('drawer').hidden) openDrawer();
    else closeDrawer();
  });
  $('closeDrawer').addEventListener('click', closeDrawer);
  $('recBtn').addEventListener('click', toggleRecord);
  $('undoBtn').addEventListener('click', undo);
  $('clearBtn').addEventListener('click', clearSheet);
  $('playBtn').addEventListener('click', togglePlay);
  $('exitBtn').addEventListener('click', exitPlayback);
  $('scrub').addEventListener('input', function (e) {
    pausePlay();
    seekTo(Number(e.target.value));
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (!$('drawer').hidden) closeDrawer();
      else exitPlayback();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
      return;
    }
    // Keys below are ignored while a control has focus, so Space still clicks buttons normally.
    var tag = e.target && e.target.tagName;
    if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'r' || e.key === 'R') toggleRecord();
    else if (e.key === ' ' && pb) { e.preventDefault(); togglePlay(); }
  });

  var toastEl = $('toast');
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2800);
  }
  function fail(err, prefix) {
    toast((prefix || '') + (err && err.message ? err.message : err));
  }

  window.addEventListener('resize', resize);
  if (window.matchMedia) {
    var dark = window.matchMedia('(prefers-color-scheme: dark)');
    if (dark.addEventListener) dark.addEventListener('change', redraw);
  }

  resize();
  DB.get('kv', 'sheet')
    .then(function (saved) {
      if (saved) sheet = saved;
      redraw();
    })
    .catch(function (err) { fail(err, 'Could not open storage: '); });
})();
