// Node tests for the GIF encoder. Run from the project folder:  node tests/gif.js
// Each file is read back with a separate decoder, so the test checks the bytes, not only that encoding ran.
'use strict';
require('../sketch/core.js');
require('../sketch/gif.js');
var SK = globalThis.SK;
var failures = 0;
function check(name, ok, info) {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (info ? '  ' + info : ''));
  if (!ok) failures++;
}

// Reads a GIF made by SK.encodeGif: its size, delay of each frame, and the RGB of every pixel in every frame.
function readGif(bytes) {
  var p = 0;
  function u8() { return bytes[p++]; }
  function u16() { var v = bytes[p] | (bytes[p + 1] << 8); p += 2; return v; }
  var sig = String.fromCharCode.apply(null, bytes.subarray(0, 6)); p = 6;
  var width = u16(), height = u16();
  var flags = u8(); u8(); u8();
  var table = null;
  if (flags & 0x80) {
    var n = 1 << ((flags & 7) + 1);
    table = [];
    for (var c = 0; c < n; c++) { table.push([u8(), u8(), u8()]); }
  }
  var frames = [];
  var delays = [];
  var loops = null;
  var delay = 0;
  while (p < bytes.length) {
    var tag = u8();
    if (tag === 0x3B) break;
    if (tag === 0x21) {
      var label = u8();
      if (label === 0xF9) {
        u8();                          // block size 4
        u8();                          // packed: disposal and transparency
        delay = u16();
        u8();                          // transparent index
        u8();                          // terminator
        delays.push(delay * 10);
      } else if (label === 0xFF) {
        u8();                          // block size 11
        var app = String.fromCharCode.apply(null, bytes.subarray(p, p + 11)); p += 11;
        var size = u8();
        u8();                          // sub-block id
        loops = u16();
        u8();                          // terminator
        if (app !== 'NETSCAPE2.0') throw new Error('unexpected application ' + app);
        void size;
      } else {
        throw new Error('unknown extension ' + label);
      }
      continue;
    }
    if (tag !== 0x2C) throw new Error('unexpected block at ' + (p - 1));
    var left = u16(), top = u16(), fw = u16(), fh = u16();
    var iflags = u8();
    if (iflags & 0x80) throw new Error('local colour tables are not used');
    var minCode = u8();
    var data = [];
    var len;
    while ((len = u8()) > 0) { for (var i = 0; i < len; i++) data.push(u8()); }
    var idx = unlzw(data, minCode, fw * fh);
    var pix = [];
    idx.forEach(function (k) { pix.push(table[k]); });
    frames.push({ left: left, top: top, width: fw, height: fh, rgb: pix });
  }
  return { sig: sig, width: width, height: height, frames: frames, delays: delays, loops: loops };
}

// A plain LZW decoder for GIF's variable-width codes.
function unlzw(data, minCode, count) {
  var clear = 1 << minCode, eoi = clear + 1;
  var codeSize = minCode + 1, next = eoi + 1;
  var prefix = {}, suffix = {}, firstOf = {};
  for (var k = 0; k < clear; k++) { suffix[k] = k; firstOf[k] = k; }
  var out = [], bitPos = 0, prev = -1;
  function read() {
    var v = 0;
    for (var b = 0; b < codeSize; b++) {
      var byteIndex = (bitPos >> 3), bit = bitPos & 7;
      if (byteIndex >= data.length) return eoi;
      v |= ((data[byteIndex] >> bit) & 1) << b;
      bitPos++;
    }
    return v;
  }
  function expand(code) {
    var seq = [];
    while (code >= clear + 2) { seq.push(suffix[code]); code = prefix[code]; }
    seq.push(suffix[code]);
    return seq.reverse();
  }
  while (out.length < count) {
    var code = read();
    if (code === eoi) break;
    if (code === clear) { codeSize = minCode + 1; next = eoi + 1; prev = -1; continue; }
    var seq;
    if (code < next && (code < clear || prefix[code] !== undefined || code < clear)) seq = expand(code);
    else if (code === next && prev >= 0) { seq = expand(prev); seq.push(seq[0]); }
    else throw new Error('bad LZW code ' + code);
    seq.forEach(function (v) { out.push(v); });
    if (prev >= 0 && next < 4096) {
      prefix[next] = prev;
      suffix[next] = seq[0];
      next++;
      if (next === (1 << codeSize) && codeSize < 12) codeSize++;
    }
    prev = code;
  }
  return out;
}

function frameOf(w, h, fn) {
  var data = new Uint8ClampedArray(w * h * 4);
  for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
    var rgb = fn(x, y), p = (y * w + x) * 4;
    data[p] = rgb[0]; data[p + 1] = rgb[1]; data[p + 2] = rgb[2]; data[p + 3] = rgb[3] === undefined ? 255 : rgb[3];
  }
  return { width: w, height: h, data: data };
}

// A pale background with a dark diagonal line, the way a drawing looks.
var drawing = frameOf(40, 30, function (x, y) { return Math.abs(x - y) < 1 ? [20, 20, 20] : [245, 240, 225]; });
var second = frameOf(40, 30, function (x, y) { return Math.abs(x + y - 30) < 1 ? [200, 30, 30] : [245, 240, 225]; });
var bytes = SK.encodeGif([drawing, second], 300);
var gif = readGif(bytes);

check('starts with the GIF89a signature', gif.sig === 'GIF89a', gif.sig);
check('logical size is the frame size', gif.width === 40 && gif.height === 30, gif.width + 'x' + gif.height);
check('two frames come back', gif.frames.length === 2, gif.frames.length + ' frames');
check('each frame lasts 300 ms', gif.delays.length === 2 && gif.delays.every(function (d) { return d === 300; }), JSON.stringify(gif.delays));
check('the animation loops forever', gif.loops === 0, 'loops=' + gif.loops);

function sameAs(frame, src) {
  for (var i = 0; i < src.width * src.height; i++) {
    var p = i * 4;
    var got = frame.rgb[i];
    if (!got || got[0] !== src.data[p] || got[1] !== src.data[p + 1] || got[2] !== src.data[p + 2]) return false;
  }
  return true;
}
check('frame 1 pixels read back exactly', sameAs(gif.frames[0], drawing));
check('frame 2 pixels read back exactly', sameAs(gif.frames[1], second));

// Many colours, so the 3-3-2 cube is used. Long random runs force the code table to fill and reset.
var seed = 7;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
var noisy = frameOf(120, 90, function () { return [Math.floor(rnd() * 256), Math.floor(rnd() * 256), Math.floor(rnd() * 256)]; });
var noisyGif = readGif(SK.encodeGif([noisy], 100));
var cubeOk = noisyGif.frames[0].rgb.length === 120 * 90 && noisyGif.frames[0].rgb.every(function (c) { return c && c.length === 3; });
check('noisy frame (cube colours, table reset) decodes to every pixel', cubeOk && noisyGif.frames[0].rgb.every(function (c, i) {
  var p = i * 4;
  var r = noisy.data[p], g = noisy.data[p + 1], b = noisy.data[p + 2];
  return Math.abs(c[0] - r) <= 36 && Math.abs(c[1] - g) <= 36 && Math.abs(c[2] - b) <= 85;
}), 'colours within the cube step');

// A flat single-colour frame has one palette entry and still makes a valid file.
var flat = readGif(SK.encodeGif([frameOf(10, 10, function () { return [9, 9, 9]; })], 500));
check('a one-colour frame encodes', flat.frames.length === 1 && flat.frames[0].rgb.every(function (c) { return c[0] === 9; }) && flat.delays[0] === 500);

// Transparent pixels are laid on white.
var see = readGif(SK.encodeGif([frameOf(4, 1, function () { return [0, 0, 0, 0]; })], 100));
check('transparent pixels become white', see.frames[0].rgb.every(function (c) { return c[0] === 255 && c[1] === 255 && c[2] === 255; }));

var mismatch = 0;
try { SK.encodeGif([drawing, frameOf(3, 3, function () { return [0, 0, 0]; })], 100); } catch (e) { mismatch = 1; }
check('frames of different sizes are refused', mismatch === 1);

console.log(failures ? failures + ' failed' : 'all passed');
process.exitCode = failures ? 1 : 0;
