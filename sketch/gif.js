// Quick Detail — GIF encoder. Turns frames of RGBA pixels into an animated GIF (GIF89a, looping, LZW). Pure: runs in the page and in Node.
//
// Colours: when the frames use 256 colours or fewer (line drawings nearly always do) the palette is exact. Otherwise each
// pixel is rounded to a 3-3-2 bit colour cube. Transparent pixels are laid on white, so the GIF has no transparency.
(function (root) {
  'use strict';

  var SK = root.SK || {};

  // frames: [{ width, height, data }] where data is RGBA bytes (a Uint8ClampedArray or Uint8Array), all frames the same size.
  // delayMs: time each frame shows, in milliseconds (GIF stores hundredths, so it rounds to 10 ms).
  // Resolves nothing and returns a Uint8Array of the whole file.
  SK.encodeGif = function (frames, delayMs) {
    if (!frames.length) throw new Error('No frames to make a GIF from.');
    var w = frames[0].width, h = frames[0].height;
    frames.forEach(function (f) {
      if (f.width !== w || f.height !== h) throw new Error('GIF frames must all be the same size.');
    });
    var pal = palette(frames);
    var bits = Math.max(1, Math.ceil(Math.log(pal.colors.length) / Math.LN2));   // colour table size is 2^bits
    var minCode = Math.max(2, bits);
    var out = new Bytes();

    out.str('GIF89a');
    out.u16(w);
    out.u16(h);
    out.byte(0x80 | (bits - 1));   // global colour table present, size 2^bits
    out.byte(0);                    // background colour index
    out.byte(0);                    // pixel aspect ratio: not given
    var size = 1 << bits;
    for (var c = 0; c < size; c++) {
      var rgb = pal.colors[c] || [0, 0, 0];
      out.byte(rgb[0]); out.byte(rgb[1]); out.byte(rgb[2]);
    }

    // Loop forever (the NETSCAPE2.0 application extension; 0 means no limit).
    out.bytes([0x21, 0xFF, 0x0B]);
    out.str('NETSCAPE2.0');
    out.bytes([0x03, 0x01, 0x00, 0x00, 0x00]);

    var delay = Math.max(1, Math.round(delayMs / 10));
    frames.forEach(function (f) {
      var index = indexFrame(f, pal);
      // Graphic control: replace the frame each time (disposal 1 = leave as is), no transparent colour.
      out.bytes([0x21, 0xF9, 0x04, 0x04, delay & 0xFF, (delay >> 8) & 0xFF, 0x00, 0x00]);
      out.byte(0x2C);                 // image separator
      out.u16(0); out.u16(0);         // left, top
      out.u16(w); out.u16(h);
      out.byte(0);                    // no local colour table, not interlaced
      out.byte(minCode);
      var packed = lzw(index, minCode);
      for (var i = 0; i < packed.length; i += 255) {   // data is stored in blocks of up to 255 bytes
        var end = Math.min(i + 255, packed.length);
        out.byte(end - i);
        out.bytes(packed.subarray(i, end));
      }
      out.byte(0);                    // end of image data
    });
    out.byte(0x3B);                   // trailer
    return out.done();
  };

  // The colour table, as [r, g, b] entries. Exact when the frames have 256 colours or fewer, else a 3-3-2 cube.
  function palette(frames) {
    var seen = {}, colors = [];
    for (var f = 0; f < frames.length && colors.length <= 256; f++) {
      var d = frames[f].data;
      for (var p = 0; p < d.length; p += 4) {
        var key = flatten(d, p);
        if (seen[key] === undefined) {
          seen[key] = colors.length;
          colors.push([(key >> 16) & 255, (key >> 8) & 255, key & 255]);
          if (colors.length > 256) break;
        }
      }
    }
    if (colors.length <= 256) return { exact: true, map: seen, colors: colors };
    var cube = [];
    for (var r = 0; r < 8; r++) for (var g = 0; g < 8; g++) for (var b = 0; b < 4; b++) {
      cube.push([r * 36, g * 36, b * 85]);   // the value each index stands for; indexFrame rounds to the nearest
    }
    return { exact: false, colors: cube };
  }

  // One pixel as a 24-bit number, laid on white when it is see-through.
  function flatten(d, p) {
    var a = d[p + 3] / 255;
    var r = Math.round(d[p] * a + 255 * (1 - a));
    var g = Math.round(d[p + 1] * a + 255 * (1 - a));
    var b = Math.round(d[p + 2] * a + 255 * (1 - a));
    return (r << 16) | (g << 8) | b;
  }

  function indexFrame(f, pal) {
    var n = f.width * f.height, out = new Uint8Array(n), d = f.data;
    for (var i = 0; i < n; i++) {
      var p = i * 4;
      if (pal.exact) {
        out[i] = pal.map[flatten(d, p)];
      } else {
        var a = d[p + 3] / 255;
        var r = Math.round(d[p] * a + 255 * (1 - a)), g = Math.round(d[p + 1] * a + 255 * (1 - a)), b = Math.round(d[p + 2] * a + 255 * (1 - a));
        out[i] = (Math.min(7, Math.round(r / 36)) * 8 + Math.min(7, Math.round(g / 36))) * 4 + Math.min(3, Math.round(b / 85));
      }
    }
    return out;
  }

  // LZW as GIF stores it: codes start at minCode + 1 bits and grow to 12 bits; the table is cleared when it fills.
  function lzw(index, minCode) {
    var clear = 1 << minCode, eoi = clear + 1;
    var out = new Bytes(), acc = 0, accBits = 0;
    var codeSize = minCode + 1, next = eoi + 1;
    var table = new Map();

    function emit(code) {
      acc |= code << accBits;
      accBits += codeSize;
      while (accBits >= 8) { out.byte(acc & 255); acc >>>= 8; accBits -= 8; }
    }
    function reset() { table = new Map(); codeSize = minCode + 1; next = eoi + 1; }

    emit(clear);
    if (!index.length) { emit(eoi); }
    else {
      var prefix = index[0];
      for (var i = 1; i < index.length; i++) {
        var k = index[i], key = prefix * 256 + k;
        if (table.has(key)) { prefix = table.get(key); continue; }
        emit(prefix);
        if (next < 4096) {
          table.set(key, next++);
          if (next > (1 << codeSize) && codeSize < 12) codeSize++;
        } else {
          emit(clear);
          reset();
        }
        prefix = k;
      }
      emit(prefix);
      emit(eoi);
    }
    if (accBits > 0) out.byte(acc & 255);
    return out.done();
  }

  // A growing byte list.
  function Bytes() { this.buf = new Uint8Array(1024); this.len = 0; }
  Bytes.prototype.grow = function (extra) {
    if (this.len + extra <= this.buf.length) return;
    var next = new Uint8Array(Math.max(this.buf.length * 2, this.len + extra));
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  };
  Bytes.prototype.byte = function (v) { this.grow(1); this.buf[this.len++] = v; };
  Bytes.prototype.bytes = function (list) { this.grow(list.length); for (var i = 0; i < list.length; i++) this.buf[this.len++] = list[i]; };
  Bytes.prototype.u16 = function (v) { this.byte(v & 255); this.byte((v >> 8) & 255); };
  Bytes.prototype.str = function (s) { for (var i = 0; i < s.length; i++) this.byte(s.charCodeAt(i)); };
  Bytes.prototype.done = function () { return this.buf.subarray(0, this.len); };

  root.SK = SK;
})(typeof window !== 'undefined' ? window : globalThis);
