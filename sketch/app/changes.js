// Quick Detail app — Changes, undo and redo.
// Every edit goes through commitPut / commitDel / commitReplace, which push an undo step, log the event to the
// recording in progress, save and redraw. undo() and redo() replay those steps.
// Part of the app split across sketch/app/*.js. The parts share the page's global scope, so load order matters:
// see the <script> list in index.html and docs/code-map/index.html.
'use strict';

// ===================================================================
// Changes: every edit goes through these, for undo and for the recording
// ===================================================================

// Adds an event to the take in progress (nothing when not recording).
function logEvent(ev) {
  if (!take) return;
  if (ev.t == null) ev.t = rel();
  take.events.push(ev);
  activity();
}

// After every change: marks it modified, saves soon, rewrites the live file, refreshes the chips and redraws.
function changed() {
  detail.modified = Date.now();
  saveSoon();
  scheduleLive();
  if (sel && !byId(sel.id)) sel = null;
  renderChips();
  redraw();
}

// Puts an item in the open detail, replacing the one with its id.
function setItem(item) {
  var i = indexOf(detail.items, item.id);
  if (i >= 0) detail.items[i] = item; else detail.items.push(item);
}

// Adds or replaces an item, as one undo step. before is the old item (null for a new one); anim replays it stroke by stroke.
function commitPut(item, before, anim) {
  setItem(item);
  ops.push({ type: 'put', before: before || null, after: item });
  redos = [];
  logEvent({ type: 'put', item: clone(item), anim: !!anim, t: anim ? item.t0 : null });
  changed();
}

// Deletes an item, as one undo step.
function commitDel(id) {
  var i = indexOf(detail.items, id);
  if (i < 0) return;
  var before = detail.items.splice(i, 1)[0];
  ops.push({ type: 'del', before: before, index: i });
  redos = [];
  logEvent({ type: 'del', id: id });
  changed();
}

// Replaces every item at once, as one undo step (draw order, restore, copy in).
function commitReplace(items) {
  ops.push({ type: 'replace', before: detail.items, after: items });
  redos = [];
  detail.items = items;
  logEvent({ type: 'replace', items: clone(items) });
  changed();
}

// Takes back the last step: put, del, replace or scale.
function undo() {
  if (pb || drawing || editing) return;
  var op = ops.pop();
  if (!op) { toast('Nothing to undo.'); return; }
  if (op.type === 'put') {
    if (op.before) { setItem(op.before); logEvent({ type: 'put', item: clone(op.before) }); }
    else {
      var i = indexOf(detail.items, op.after.id);
      if (i >= 0) detail.items.splice(i, 1);
      logEvent({ type: 'del', id: op.after.id });
    }
  } else if (op.type === 'del') {
    detail.items.splice(Math.min(op.index, detail.items.length), 0, op.before);
    logEvent({ type: 'put', item: clone(op.before) });
  } else if (op.type === 'replace') {
    op.after = detail.items;
    detail.items = op.before;
    logEvent({ type: 'replace', items: clone(op.before) });
  } else if (op.type === 'scale') {
    op.after = { scale: detail.scale, items: clone(detail.items) };
    detail.scale = op.before.scale;
    detail.items = clone(op.before.items);
    logEvent({ type: 'replace', items: clone(detail.items) });
  }
  redos.push(op);
  changed();
}

// Redo puts back the step that undo took away. Works the same way for each kind of step.
function redo() {
  if (pb || drawing || editing) return;
  var op = redos.pop();
  if (!op) { toast('Nothing to redo.'); return; }
  if (op.type === 'put') {
    var put = clone(op.after);
    setItem(put);
    logEvent({ type: 'put', item: clone(put) });
  } else if (op.type === 'del') {
    var i = indexOf(detail.items, op.before.id);
    if (i >= 0) detail.items.splice(i, 1);
    logEvent({ type: 'del', id: op.before.id });
  } else if (op.type === 'replace') {
    detail.items = clone(op.after);
    logEvent({ type: 'replace', items: clone(detail.items) });
  } else if (op.type === 'scale') {
    detail.scale = op.after.scale;
    detail.items = clone(op.after.items);
    logEvent({ type: 'replace', items: clone(detail.items) });
  }
  ops.push(op);
  changed();
}
