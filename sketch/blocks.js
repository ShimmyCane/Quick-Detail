// Quick Detail — blocks: a finished detail placed inside another detail, as an underlay.
// A block is { id, kind: 'block', sourceId, at: [x, y], k, opacity, print }. The source's items are drawn with their
// origin at `at`, scaled by k. Edits to the source show in every block that uses it. Pure: runs in the page and in Node tests.
(function (root) {
  'use strict';

  var SK = root.SK || {};

  SK.MAX_BLOCK_DEPTH = 5;

  // A block's scale. Blocks saved before scaling existed have no k, which means 1.
  SK.blockScale = function (bk) { return bk.k > 0 ? bk.k : 1; };

  // Moves and scales a source point: t = { x, y, k, rot } maps p to t + k * R(rot) * p, where R turns by rot radians.
  // A copy of the item under t, or the item itself when t does nothing.
  function place(p, t) {
    var c = Math.cos(t.rot), s = Math.sin(t.rot);
    return [t.x + t.k * (c * p[0] - s * p[1]), t.y + t.k * (s * p[0] + c * p[1])].concat(p.slice(2));
  }
  function moved(it, t) {
    if (!t.x && !t.y && t.k === 1 && !t.rot) return it;
    var k = t.k;
    function pt(p) { return place(p, t); }
    if (it.kind === 'stroke' || it.kind === 'hatch') {
      var s = Object.assign({}, it, { pts: it.pts.map(pt) });
      if (it.kind === 'stroke') s.w = it.w * k;
      return s;
    }
    if (it.kind === 'image') return Object.assign({}, it, { at: pt(it.at), w: it.w * k, h: it.h * k });
    if (it.kind === 'note') {
      var n = Object.assign({}, it, {
        at: pt(it.at),
        width: it.width * k,
        leaders: it.leaders.map(function (ld) {
          return Object.assign({}, ld, { tip: pt(ld.tip), bends: (ld.bends || []).map(pt) });
        })
      });
      if (it.height != null) n.height = it.height * k;
      if (it.size != null) n.size = it.size * k;
      return n;
    }
    if (it.kind === 'dim') {
      var d = Object.assign({}, it);
      ['p1', 'p2', 'at', 'vertex'].forEach(function (key) { if (Array.isArray(it[key])) d[key] = pt(it[key]); });
      if (it.size != null) d.size = it.size * k;
      return d;
    }
    return it;
  }

  // Moves, scales or rotates an item. f maps each point; sc scales sizes and widths; angle turns a block (in radians).
  // Used by the select tool. Note and dimension text stays upright: only their geometry turns.
  SK.transformItem = function (it, f, sc, angle) {
    function P(p) { return f(p).concat(p.slice(2)); }
    var out = Object.assign({}, it);
    if (it.kind === 'stroke') { out.pts = it.pts.map(P); out.w = it.w * sc; }
    else if (it.kind === 'hatch') out.pts = it.pts.map(P);
    else if (it.kind === 'image') { out.at = f(it.at); out.w = it.w * sc; out.h = it.h * sc; }
    else if (it.kind === 'note') {
      out.at = f(it.at);
      out.width = it.width * sc;
      if (it.height != null) out.height = it.height * sc;
      if (it.size != null) out.size = it.size * sc;
      out.leaders = it.leaders.map(function (ld) { return Object.assign({}, ld, { tip: f(ld.tip), bends: (ld.bends || []).map(f) }); });
    } else if (it.kind === 'dim') {
      ['p1', 'p2', 'at', 'vertex'].forEach(function (key) { if (Array.isArray(it[key])) out[key] = f(it[key]); });
      if (it.size != null) out.size = it.size * sc;
    } else if (it.kind === 'block') {
      out.at = f(it.at);
      out.k = SK.blockScale(it) * sc;
      out.rot = (it.rot || 0) + (angle || 0);
    }
    return out;
  };

  // The drawable items of a list, with each block replaced by its source's items, placed and scaled.
  // Ids are the source's own, so a flattened list is for drawing and measuring only, never for editing.
  function expand(items, t, depth, stack, sourceOf, out) {
    items.forEach(function (it) {
      if (it.kind !== 'block') { out.push(moved(it, t)); return; }
      var src = sourceOf(it.sourceId);
      if (!src || depth >= SK.MAX_BLOCK_DEPTH || stack.indexOf(src.id) >= 0) return;
      var at = place(it.at, t);
      var inner = { x: at[0], y: at[1], k: t.k * SK.blockScale(it), rot: t.rot + (it.rot || 0) };
      expand(src.items || [], inner, depth + 1, stack.concat([src.id]), sourceOf, out);
    });
    return out;
  }

  // sourceOf(id) returns the detail with that id, or null when it is not on this device.
  SK.flattenItems = function (items, sourceOf) {
    return expand(items, { x: 0, y: 0, k: 1, rot: 0 }, 0, [], sourceOf, []);
  };

  // The box a block with a missing source is drawn in, so it can be seen and selected.
  function placeholderBox(block, ac) {
    var k = SK.blockScale(block);
    return { minx: block.at[0], miny: block.at[1], maxx: block.at[0] + 2.5 * ac.factor * k, maxy: block.at[1] + 1.5 * ac.factor * k };
  }

  SK.blockPlaceholder = placeholderBox;

  // Blocks in a list whose source is not on this device.
  SK.missingBlocks = function (items, sourceOf) {
    return items.filter(function (it) { return it.kind === 'block' && !sourceOf(it.sourceId); });
  };

  SK.blockBounds = function (block, sourceOf, ac) {
    if (!sourceOf(block.sourceId)) return placeholderBox(block, ac);
    return SK.itemsBounds(SK.flattenItems([block], sourceOf), ac);
  };

  // Is world point p on the block? A block counts as hit anywhere on its lines or notes.
  SK.blockHit = function (block, p, tol, sourceOf, ac) {
    if (!sourceOf(block.sourceId)) {
      var b = placeholderBox(block, ac);
      return p[0] >= b.minx - tol && p[0] <= b.maxx + tol && p[1] >= b.miny - tol && p[1] <= b.maxy + tol;
    }
    return SK.flattenItems([block], sourceOf).some(function (it) { return SK.hitItem(it, p, tol, ac); });
  };

  // Every detail that shows the source, directly or through a block in another block.
  SK.usersOf = function (sourceId, details) {
    var users = [], frontier = [sourceId];
    while (frontier.length) {
      var id = frontier.pop();
      details.forEach(function (d) {
        if (d.id === sourceId || users.indexOf(d) >= 0) return;
        if ((d.items || []).some(function (it) { return it.kind === 'block' && it.sourceId === id; })) {
          users.push(d);
          frontier.push(d.id);
        }
      });
    }
    return users;
  };

  // How many block levels deep a list goes. Missing sources count as empty.
  SK.nestingOf = function (items, sourceOf, stack) {
    stack = stack || [];
    var deepest = 0;
    items.forEach(function (it) {
      if (it.kind !== 'block') return;
      var src = sourceOf(it.sourceId);
      if (!src || stack.indexOf(src.id) >= 0) return;
      deepest = Math.max(deepest, 1 + SK.nestingOf(src.items || [], sourceOf, stack.concat([src.id])));
    });
    return deepest;
  };

  // Does the detail with id `from` reach the detail with id `target` through its blocks?
  function reaches(from, target, sourceOf, seen) {
    if (from === target) return true;
    if (seen.indexOf(from) >= 0) return false;
    seen.push(from);
    var src = sourceOf(from);
    return !!src && (src.items || []).some(function (it) {
      return it.kind === 'block' && reaches(it.sourceId, target, sourceOf, seen);
    });
  }

  // Why a block of sourceId cannot go into the host's list, or null when it can.
  SK.blockRefusal = function (hostId, hostItems, sourceId, sourceOf) {
    if (sourceId === hostId) return 'A detail cannot hold itself.';
    if (!sourceOf(sourceId)) return 'That detail is not on this device.';
    if (reaches(sourceId, hostId, sourceOf, [])) return 'That detail already holds this one, so the block would loop.';
    var probe = hostItems.concat([{ kind: 'block', sourceId: sourceId, at: [0, 0] }]);
    if (SK.nestingOf(probe, sourceOf) > SK.MAX_BLOCK_DEPTH) return 'Blocks can nest ' + SK.MAX_BLOCK_DEPTH + ' levels deep at most.';
    return null;
  };

  // Plain copies of a block's lines, notes and dimensions, with new ids, placed and scaled. This is the duplicate route.
  SK.copyInBlock = function (block, sourceOf, newId) {
    return SK.flattenItems([block], sourceOf).map(function (it) {
      var c = JSON.parse(JSON.stringify(it));
      c.id = newId();
      return c;
    });
  };

  root.SK = SK;
  if (typeof module !== 'undefined' && module.exports) module.exports = SK;
})(typeof window !== 'undefined' ? window : globalThis);
