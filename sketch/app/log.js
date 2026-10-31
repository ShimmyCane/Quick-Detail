// Quick Detail app — Log and replay.
// The film strip of every scene, clip playback, and the replay player in the right panel.
// Part of the app split across sketch/app/*.js. The parts share the page's global scope, so load order matters:
// see the <script> list in index.html and docs/code-map/index.html.
'use strict';

// ---- log: a film strip of every scene ----

function sessionBounds(s) {
  var items = s.base.slice();
  s.events.forEach(function (ev) {
    if (ev.type === 'put') items.push(ev.item);
    else if (ev.type === 'replace') items = items.concat(ev.items);
  });
  return SK.itemsBounds(visible(items), acFor(detail, s.scale));
}

var thumbObserver = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
  entries.forEach(function (en) {
    if (!en.isIntersecting || !en.target._paint) return;
    en.target._paint();
    en.target._paint = null;
    thumbObserver.unobserve(en.target);
  });
}, { root: null, rootMargin: '200px' }) : null;

function renderLog() {
  var strip = $('logStrip');
  strip.innerHTML = '';
  var total = 0;
  sessions.forEach(function (s) { total += scenesOf(s).length; });
  $('logTitle').textContent = detail.name + ' · ' + total + (total === 1 ? ' scene' : ' scenes');
  if (!sessions.length) {
    strip.appendChild(el('p', { class: 'muted empty', text: 'No scenes yet. Start drawing: recording starts with the pen and stops 5 seconds after you lift it. Tap the scene button to start a new scene while you talk.' }));
    return;
  }
  var col = colors();
  var n = 0;
  sessions.forEach(function (s) {
    var when = new Date(s.created);
    strip.appendChild(el('div', { class: 'divider' }, [
      el('b', { text: when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }),
      el('span', { text: when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) + ' · ' + SK.formatTime(s.duration) + (s.audio ? '' : ' · no sound') })
    ]));
    var b = sessionBounds(s);
    scenesOf(s).forEach(function (m) {
      n++;
      var thumb = el('div', { class: 'thumb' });
      var full = el('div', { class: 'more' }, [
        el('p', { text: m.text || 'Nothing was said in this scene.' }),
        el('div', { class: 'row' }, [
          el('button', { class: 'chip', text: '▶ Clip', on: { click: function (e) { e.stopPropagation(); playClip(s, m); } } }),
          el('button', { class: 'chip', text: 'Replay', on: { click: function (e) { e.stopPropagation(); openReplay(s, m.start); } } }),
          el('button', { class: 'chip', text: 'Restore', on: { click: function (e) {
            e.stopPropagation();
            if (!window.confirm('Put the sheet back the way it was at the end of this scene? Undo brings it back.')) return;
            commitReplace(clone(SK.stateAt(s, m.end)));
            toast('Restored. Undo to go back.');
          } } }),
          el('button', { class: 'chip', text: 'Branch', on: { click: function (e) {
            e.stopPropagation();
            branchFrom(SK.stateAt(s, m.end), 'branch from scene ' + num, { step: num });
          } } })
        ])
      ]);
      var num = n;
      var card = el('article', { class: 'card' + (m.marked ? ' marked' : ''), on: { click: function () { card.classList.toggle('open'); } } }, [
        thumb,
        el('b', { text: 'Scene ' + num + ' · ' + SK.formatTime(m.start) }),
        el('p', { class: 'words', text: m.text ? SK.firstWords(m.text, 8) : '(no words)' }),
        full
      ]);
      card._paint = function () {
        thumb.appendChild(SK.picture(visible(SK.stateAt(s, m.end)), b, 200, 130, { ac: acFor(detail, s.scale), ink: col.ink, paper: col.paper }));
      };
      strip.appendChild(card);
      if (thumbObserver) thumbObserver.observe(card); else card._paint();
    });
  });
  strip.scrollLeft = strip.scrollWidth;
}

function playClip(s, m) {
  if (clip) { clip.pause(); URL.revokeObjectURL(clip.src); clip = null; }
  if (!s.audio) { toast('This recording has no sound.'); return; }
  var a = new Audio(URL.createObjectURL(s.audio));
  var start = Math.max(0, m.start - (s.audioOffset || 0) - 300) / 1000;
  var end = Math.max(start + 1, (m.end - (s.audioOffset || 0) + 800) / 1000);
  a.addEventListener('timeupdate', function () { if (a.currentTime >= end) a.pause(); });
  a.currentTime = start;
  a.play().catch(function () { toast('Could not play the clip.'); });
  clip = a;
}

// ---- replay ----

function openReplay(s, T) {
  stopRecording();
  closePanel();
  endDraft();
  select(null);
  var saved = clone(view);
  var b = sessionBounds(s);
  pb = {
    s: s, scenes: scenesOf(s), T: 0, items: [], playing: false, startT: 0, startedAt: 0, raf: 0, current: -1,
    savedView: saved, url: s.audio ? URL.createObjectURL(s.audio) : null, audio: null
  };
  if (pb.url) { pb.audio = new Audio(pb.url); pb.audio.preload = 'auto'; }
  view = SK.fitView(b, W(), H() * 0.62, 40, defaultZ(detail) * 2) || view;
  $('scrub').max = s.duration;
  var list = $('playerScenes');
  list.innerHTML = '';
  pb.scenes.forEach(function (m, i) {
    list.appendChild(el('button', { class: 'pscene', on: { click: function () { seekTo(m.start); startPlay(); } } }, [
      el('b', { text: (i + 1) + ' · ' + SK.formatTime(m.start) }),
      el('span', { text: m.text ? SK.firstWords(m.text, 8) : '(no words)' })
    ]));
  });
  document.body.classList.add('replaying');
  openPanel('playback');   // the controls sit in the right panel
  seekTo(T || 0);
}

function setT(T) {
  pb.T = Math.max(0, Math.min(T, pb.s.duration));
  pb.items = SK.stateAt(pb.s, pb.T);
  redraw();
  $('scrub').value = Math.round(pb.T);
  $('clock').textContent = SK.formatTime(pb.T) + ' / ' + SK.formatTime(pb.s.duration);
  $('playBtn').textContent = pb.playing ? '❚❚' : '▶';
  var cur = -1;
  pb.scenes.forEach(function (m, i) { if (m.start <= pb.T) cur = i; });
  if (cur !== pb.current) {
    pb.current = cur;
    var kids = $('playerScenes').children;
    for (var i = 0; i < kids.length; i++) kids[i].classList.toggle('on', i === cur);
    if (kids[cur]) kids[cur].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

function seekTo(T) {
  setT(T);
  pb.startT = pb.T;
  pb.startedAt = performance.now();
  if (pb.audio) pb.audio.currentTime = Math.max(0, pb.T - (pb.s.audioOffset || 0)) / 1000;
}

function startPlay() {
  if (!pb || pb.playing) return;
  if (pb.T >= pb.s.duration) seekTo(0);
  pb.playing = true;
  pb.startT = pb.T;
  pb.startedAt = performance.now();
  if (pb.audio) pb.audio.play().catch(function () {});
  pb.raf = requestAnimationFrame(frame);
  setT(pb.T);
}

function pausePlay() {
  if (!pb || !pb.playing) return;
  pb.playing = false;
  cancelAnimationFrame(pb.raf);
  if (pb.audio) pb.audio.pause();
  setT(pb.T);
}

function frame() {
  if (!pb || !pb.playing) return;
  var T = pb.startT + performance.now() - pb.startedAt;
  if (T >= pb.s.duration) { setT(pb.s.duration); pausePlay(); return; }
  setT(T);
  pb.raf = requestAnimationFrame(frame);
}

function exitReplay() {
  if (!pb) return;
  pausePlay();
  if (pb.url) URL.revokeObjectURL(pb.url);
  view = pb.savedView;
  pb = null;
  parkPlayer();
  document.body.classList.remove('replaying');
  if (panelKind === 'playback') { var body = $('panelBody'); body.innerHTML = ''; renderPlayback(body); }
  redraw();
}

$('playBtn').addEventListener('click', function () { if (pb) { if (pb.playing) pausePlay(); else startPlay(); } });
$('exitBtn').addEventListener('click', exitReplay);
$('scrub').addEventListener('input', function (e) { pausePlay(); seekTo(+e.target.value); });
