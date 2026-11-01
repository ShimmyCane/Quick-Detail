// Quick Detail app — Recording and scenes.
// A take starts with the pen and stops 5 s after the last activity. The scene button marks a new scene.
// Part of the app split across sketch/app/*.js. The parts share the page's global scope, so load order matters:
// see the <script> list in index.html and docs/code-map/index.html.
'use strict';

// ===================================================================
// Recording: starts with the pen, stops 5 s after the last activity. The scene button forces a new scene.
// ===================================================================

// Starts a take if none is running.
function ensureTake() {
  if (take || pb) return;
  take = SK.startTake(clone(detail.items), activity);
  take.detailId = detail.id;
  take.scale = detail.scale;
  showRec(true);
}

// Something happened: push the auto-stop back. Never stops while a pointer is down.
function activity() {
  if (!take) return;
  clearTimeout(stopTimer);
  if (active || drag) return;
  stopTimer = setTimeout(stopRecording, AUTO_STOP_MS);
}

// Stops the take and saves it as a recording, unless nothing happened.
function stopRecording() {
  var r = take;
  if (!r) return Promise.resolve();
  take = null;
  clearTimeout(stopTimer);
  showRec(false);
  return SK.stopTake(r).then(function (res) {
    if (!r.events.length && !r.speech.length) { updateScenes(); return; }
    var s = {
      id: uid('r'), detailId: r.detailId, created: Date.now() - res.duration, duration: res.duration,
      scale: r.scale, base: r.base, events: r.events, speech: r.speech, voice: r.voice,
      audioOffset: r.audioOffset, audio: res.audio
    };
    return SK.DB.put('sessions', s).then(function () {
      if (detail && detail.id === s.detailId) { sessions.push(s); saveSoon(); scheduleLive(); }
      updateScenes();
      if (panelKind === 'log') renderLog();
    });
  }).catch(function (e) { fail(e, 'Could not save the recording: '); });
}

// Marks a new scene (the scene button or N), with a flash.
function newScene() {
  if (pb) return;
  ensureTake();
  logEvent({ type: 'mark' });
  var f = $('flash');
  f.hidden = false;
  f.classList.remove('go');
  void f.offsetWidth;
  f.classList.add('go');
  setTimeout(function () { f.hidden = true; }, 400);
  updateScenes();
}

// The scenes of a recording, worked out once and kept on it.
function scenesOf(s) { return s._scenes || (s._scenes = SK.segment(s)); }

// Updates the scene count on the scene button.
function updateScenes() {
  var n = 0;
  sessions.forEach(function (s) { n += scenesOf(s).length; });
  if (take) n += SK.segment(take).length;
  $('sceneCount').textContent = n;
}

// Shows or hides the recording dot and its clock.
function showRec(on) {
  $('recDot').hidden = !on;
  $('sceneBtn').classList.toggle('live', on);
  clearInterval(recTimer);
  if (on) {
    $('recTime').textContent = '00:00';
    recTimer = setInterval(function () {
      $('recTime').textContent = SK.formatTime(rel());
      updateScenes();
    }, 500);
  }
}
