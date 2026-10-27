// Sketch v3 — the microphone. One stream stays open while the page is visible, so a recording can start
// the moment the pen touches. Each take gets its own MediaRecorder, speech text, and voice activity spans.
(function (root) {
  'use strict';

  var SK = root.SK || {};
  var mic = null;        // { stream, ctx, analyser, buf }
  var asking = null;     // the pending or settled permission request

  SK.Mic = {
    // Resolves to the mic, or null when there is none or permission was refused (asked once per page load).
    ensure: function () {
      if (mic) return Promise.resolve(mic);
      if (asking) return asking;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.resolve(null);
      asking = navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        mic = { stream: stream, ctx: null, analyser: null, buf: null };
        try {
          var AC = window.AudioContext || window.webkitAudioContext;
          mic.ctx = new AC();
          mic.analyser = mic.ctx.createAnalyser();
          mic.analyser.fftSize = 1024;
          mic.ctx.createMediaStreamSource(stream).connect(mic.analyser);
          mic.buf = new Float32Array(mic.analyser.fftSize);
        } catch (e) { mic.analyser = null; }
        asking = null;
        return mic;
      }).catch(function () { return null; });
      return asking;
    },
    // Audio contexts start suspended until a touch; call this from a pointer handler.
    resume: function () {
      if (mic && mic.ctx && mic.ctx.state === 'suspended') mic.ctx.resume().catch(function () {});
    },
    level: function () {
      if (!mic || !mic.analyser) return 0;
      mic.analyser.getFloatTimeDomainData(mic.buf);
      var sum = 0;
      for (var i = 0; i < mic.buf.length; i++) sum += mic.buf[i] * mic.buf[i];
      return Math.sqrt(sum / mic.buf.length);
    },
    close: function () {
      if (!mic) return;
      mic.stream.getTracks().forEach(function (t) { t.stop(); });
      if (mic.ctx) mic.ctx.close().catch(function () {});
      mic = null;
    }
  };

  function audioOptions() {
    if (!window.MediaRecorder) return null;
    var types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    for (var i = 0; i < types.length; i++) {
      if (MediaRecorder.isTypeSupported(types[i])) return { mimeType: types[i] };
    }
    return {};
  }

  function since(take) { return Math.max(0, Math.round(performance.now() - take.t0)); }

  function startSpeech(take) {
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
        if (text) take.speech.push({ t: since(take), text: text });
      }
    };
    function begin() {
      if (!take.live) return;
      try { recog.start(); } catch (_) { setTimeout(begin, 500); }   // the last take's recogniser may still be closing
    }
    recog.onend = begin;
    recog.onerror = function (e) {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') take.speechBlocked = true;
      if (take.speechBlocked) recog.onend = null;
    };
    take.recog = recog;
    begin();
  }

  // Voice activity: louder than the room for a moment means talking. Spans go into take.voice.
  function watchVoice(take, onVoice) {
    var floor = 0.01, on = false, lastLoud = 0;
    take.vad = setInterval(function () {
      var lv = SK.Mic.level();
      if (!lv) return;
      var now = since(take);
      var loud = lv > Math.max(0.02, floor * 3);
      // The floor follows quiet quickly and loud slowly, so a steady fan or hum stops counting as talk
      // within about ten seconds, while speech (which comes and goes) keeps counting.
      floor = loud ? floor * 0.99 + lv * 0.01 : floor * 0.97 + lv * 0.03;
      if (loud) {
        lastLoud = now;
        if (!on) { on = true; take.voice.push([now, now]); }
        take.voice[take.voice.length - 1][1] = now;
        onVoice();
      } else if (on && now - lastLoud > 400) {
        on = false;
      }
    }, 100);
  }

  // Start a take now. t0 is set before anything async, so strokes drawn at once are timed correctly.
  SK.startTake = function (base, onVoice) {
    var take = {
      t0: performance.now(),
      base: base,
      events: [],
      speech: [],
      voice: [],
      audioOffset: 0,
      recorder: null,
      chunks: [],
      recog: null,
      vad: 0,
      live: true
    };
    SK.Mic.ensure().then(function (m) {
      if (!take.live || !m) return;
      var opts = audioOptions();
      if (opts) {
        take.recorder = new MediaRecorder(m.stream, opts.mimeType ? opts : undefined);
        take.recorder.ondataavailable = function (e) { if (e.data && e.data.size) take.chunks.push(e.data); };
        take.recorder.onstart = function () { take.audioOffset = since(take); };
        take.recorder.start(1000);
      }
      watchVoice(take, onVoice);
    });
    startSpeech(take);
    return take;
  };

  // Stop a take. Resolves to { duration, audio } once the speech and the audio are flushed.
  SK.stopTake = function (take) {
    take.live = false;
    clearInterval(take.vad);
    var duration = since(take);
    var speechDone = new Promise(function (done) {
      if (!take.recog) return done();
      take.recog.onend = done;
      setTimeout(done, 1500);     // speech sometimes sends its last words after stop()
      try { take.recog.stop(); } catch (_) { done(); }
    });
    var audioDone = new Promise(function (done) {
      var r = take.recorder;
      if (!r) return done(null);
      var finish = function () { done(new Blob(take.chunks, { type: r.mimeType || 'audio/webm' })); };
      if (r.state === 'inactive') return finish();
      r.onstop = finish;
      r.stop();
    });
    return Promise.all([speechDone, audioDone]).then(function (res) {
      var audio = res[1];
      return { duration: duration, audio: audio && audio.size ? audio : null };
    });
  };

  root.SK = SK;
})(window);
