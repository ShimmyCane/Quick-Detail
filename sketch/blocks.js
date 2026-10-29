// Quick Detail — blocks: a finished detail placed inside another detail.
// A block is { id, kind: 'block', sourceId, at: [dx, dy] }. Its source's items are drawn moved by at, live: an edit to
// the source shows in every block that uses it. Pure: runs in the page and in Node tests.
(function (root) {
  'use strict';

  var SK = root.SK || {};

  SK.MAX_BLOCK_DEPTH = 5;

  function shift(p, dx, dy) { return [p[0] + dx, p[1] + dy].concat(p.slice(2)); }

  // A copy of an item moved by (dx, dy). Returned as it is when nothing moves, and images keep their picture data shared.
  function moved(it, dx, dy) {
    if (!dx && !dy) return it;
    if (it.kind === 'stroke' || it.kind === 'hatch') {
      return Object.assign({}, it, { pts: it.pts.map(function (p) { return shift(p, dx, dy); }) });
    }
    if (it.kind === 'image') return Object.assign({}, it, { at: shift(it.at, dx, dy) });
    if (it.kind === 'note') {
      return Object.assign({}, it, {
        at: shift(it.at, dx, dy),
        leaders: it.leaders.map(function (ld) {
          return Object.assign({}, ld, { tip: shift(ld.tip, dx, dy), bends: (ld.bends || []).map(function (b) { return shift(b, dx, dy); }) });
        })
      });
    }
    if (it.kind === 'dim') {
      var out = Object.assign({}, it);
      ['p1', 'p2', 'at', 'end', 'vertex'].forEach(function (k) { if (Array.isArray(it[k])) out[k] = shift(it[k], dx, dy); });
      return out;
    }
    return it;
  }

  // The drawable items of a list, with each block replaced by its source's items moved into place.
  // Ids are the source's own, so a flattened list is for drawing and measuring only, never for editing.
  function expand(items, dx, dy, depth, stack, sourceOf, out) {
    items.forEach(function (it) {
      if (it.kind !== 'block') { out.push(moved(it, dx, dy)); return; }
      var src = sourceOf(it.sourceId);
      if (!src || depth >= SK.MAX_BLOCK_DEPTH || stack.indexOf(src.id) >= 0) return;
      expand(src.items || [], dx + it.at[0], dy + it.at[1], depth + 1, stack.concat([src.id]), sourceOf, out);
    });
    return out;
  }

  // sourceOf(id) returns the detail with that id, or null when it is not on this device.
  SK.flattenItems = function (items, sourceOf) {
    return expand(items, 0, 0, 0, [], sourceOf, []);
  };

  // The box a block with a missing source is drawn in, so it can be seen and selected.
  function placeholderBox(block, ac) {
    return { minx: block.at[0], miny: block.at[1], maxx: block.at[0] + 2.5 * ac.factor, maxy: block.at[1] + 1.5 * ac.factor };
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

  // Plain copies of a block's lines, notes and dimensions, with new ids. This is the duplicate route, for editing one copy on its own.
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
