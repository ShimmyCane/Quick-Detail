// Quick Detail — the fork lines between tracks in the log and the viewer. A track is one lane. Its scenes run left to
// right, one column each, so the scene number sets the horizontal place. A branch's track starts after a lead as wide
// as the scenes before its fork, so its first scene sits in the column after the fork scene. A line runs from the fork
// scene down to that first scene. Browser only: it reads layout, so it is not run in Node.
(function (root) {
  'use strict';

  var SK = root.SK || {};

  // One scene column: a 200px card and the 12px gap after it.
  SK.COL_PX = 212;
  var NS = 'http://www.w3.org/2000/svg';

  // The lead of a track: as wide as the columns before its first scene. cols comes from SK.laneOffsets.
  SK.leadFor = function (cols) {
    var lead = document.createElement('div');
    lead.className = 'track-lead';
    lead.style.width = ((cols || 0) * SK.COL_PX) + 'px';
    return lead;
  };

  // Redraws every fork line in a container of tracks. Each track has data-lane, and a branch also has data-parent
  // and data-fork (the step it forked from). The container is the scrolling box that holds the tracks.
  SK.drawForks = function (container) {
    if (!container) return;
    var svg = container.querySelector(':scope > svg.forks');
    if (!svg) {
      svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'forks');
      svg.setAttribute('aria-hidden', 'true');
      svg.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;overflow:visible;';
      container.insertBefore(svg, container.firstChild);
    }
    svg.setAttribute('width', container.scrollWidth);
    svg.setAttribute('height', container.scrollHeight);
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var cr = container.getBoundingClientRect();
    // A box in the container's own scrolled coordinates.
    function box(node) {
      var r = node.getBoundingClientRect();
      return {
        l: r.left - cr.left + container.scrollLeft, r: r.right - cr.left + container.scrollLeft,
        t: r.top - cr.top + container.scrollTop, b: r.bottom - cr.top + container.scrollTop
      };
    }
    function trackOf(id) {
      var list = container.querySelectorAll('[data-lane]');
      for (var i = 0; i < list.length; i++) if (list[i].getAttribute('data-lane') === id) return list[i];
      return null;
    }

    container.querySelectorAll('[data-parent]').forEach(function (child) {
      var pid = child.getAttribute('data-parent');
      if (!pid) return;
      var parent = trackOf(pid);
      if (!parent) return;
      var step = +child.getAttribute('data-fork') || 0;
      var parentLead = parent.querySelector('.track-lead');
      var childLead = child.querySelector('.track-lead');
      var head = parent.querySelector(':scope > .track-head');

      // Where the line leaves the parent: the fork scene's bottom centre, or, if that scene is not drawn (folded
      // track), the parent's header at the fork column.
      var from = step > 0 ? parent.querySelector('[data-step="' + step + '"]') : null;
      var x0, y0;
      if (from) {
        var a = box(from);
        x0 = (a.l + a.r) / 2;
        y0 = a.b;
      } else {
        var origin = parentLead ? box(parentLead).l : box(parent).l;
        var hb = box(head || parent);
        x0 = origin + step * SK.COL_PX;
        y0 = hb.b;
      }

      // Where it lands: the branch's first scene's left edge, or, if none is drawn, the branch's lead.
      var first = child.querySelector('[data-step="1"]');
      var x1, y1;
      if (first) {
        var f = box(first);
        x1 = f.l;
        y1 = (f.t + f.b) / 2;
      } else if (childLead) {
        var lb = box(childLead);
        x1 = lb.r;
        y1 = lb.t + 16;
      } else {
        return;
      }

      var path = document.createElementNS(NS, 'path');
      path.setAttribute('d', 'M' + x0 + ' ' + y0 + ' V' + y1 + ' H' + x1);
      path.setAttribute('class', 'fork-line');
      svg.appendChild(path);
      var dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', x0);
      dot.setAttribute('cy', y0);
      dot.setAttribute('r', '3');
      dot.setAttribute('class', 'fork-dot');
      svg.appendChild(dot);
    });
  };

  root.SK = SK;
})(window);
