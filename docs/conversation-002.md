# Conversation 002: Project info, auto-record, log, shape reading, notes, dimensions

Increment spec for the wall sketch tool. Written to be handed to an implementer who was not in the conversation.

- **Previous increment (001):** blank sheet, Settings gear, manual recording of strokes + audio + speech, moments split by 3 s pauses, replay. Shipped in PR #1.
- **This increment (002):** everything below.
- **How to use this file:** Section 1 holds open questions. Each one has a **default**. If the question is not answered, build the default. Sections 3 to 10 are the build. Section 11 gives the build order with acceptance checks.

---

## 1. Open questions (with defaults)

| # | Question | Default if unanswered |
|---|---|---|
| Q1 | **What does the screen stand for on paper?** A scale needs a paper size. Real length = paper length × scale factor. | The sheet's width is **11 in of paper** (letter landscape). The sheet does not zoom or pan in this increment. |
| Q2 | **Changing the scale:** does the drawing stay the same size (so dimension numbers change), or does it resize (so the numbers stay)? | **The drawing stays.** Dimension values recompute. Text and arrow sizes stay the same on paper. This matches redeclaring the scale of a sketch. |
| Q3 | **Which scales are on the list?** | 6"=1'-0", 3"=1'-0", 1 1/2"=1'-0", 1"=1'-0", 3/4"=1'-0", 1/2"=1'-0", 1/4"=1'-0", Full size, NTS. Imperial only for now. |
| Q4 | **Tags: on the whole detail, or also on each snapshot or moment in the log?** | Both. Project info tags the detail. A log card can carry its own tags. |
| Q5 | **Auto-record needs the microphone open while the page is open** so recording can start the instant the pen touches. Is that acceptable? | Yes, after one permission prompt. The mic closes when the tab is hidden. Speech alone does not start a recording; only the pen, or the manual Record button, does. |
| Q6 | **What do Save and Snapshot each mean?** Everything already saves on its own. | **Save** stores a named version of the detail that can be restored later (a checkpoint). **Snapshot** puts a card in the log with a picture of the sheet right now, and marks a moment boundary if recording. |
| Q7 | **One detail at a time, or a library of details?** | A library. Project info has "New detail" and a list to switch between details. Each detail has its own sheet, recordings, log, and versions. |
| Q8 | **Shape reading: describe only, or also clean up** (turn a wobbly line into a straight one)? | Describe only. Labels appear in the log ("2 lines, 1 rectangle"). A setting can show small gray labels on the sheet. Clean-up comes later. |
| Q9 | **Button count.** The request adds about eight buttons in the lower right. The first version was meant to have almost none. | A thin vertical **icon rail** on the right edge. From the bottom: Settings, Record, Undo, Snapshot, Log, Dimension, Text, Project info. Settings can collapse the rail to the gear only. Icons only; a long press shows the name. |
| Q10 | **Dimension rounding** | Nearest 1/16". Settings offers 1/8", 1/4", 1/2". |
| Q11 | **Notes in capitals?** Drafting convention writes notes in capitals. | On. Settings can turn it off. |
| Q12 | **Redo** | No button. Long-press Undo means Redo. Ctrl+Shift+Z also redoes. |
| Q13 | **Later: AI description of a whole drawing** (beyond line, shape, or unsorted). This needs a small server, because a static page cannot hold an API key. | Out of scope for 002. The local stroke reader in section 7 covers "line, shape, unsorted". |

---

## 2. Where things stand (what 002 builds on)

- `index.html`: the page. One canvas `#sheet`, the gear, a drawer, a player panel.
- `sketch/core.js`: pure logic with no DOM.
  - `SK.stateAt(session, T)`: the drawing at time T.
  - `SK.segment(session)`: moments.
  - `SK.formatTime`.
  - Tests are in `tests/sketch-core.js`, run with `node tests/sketch-core.js`.
- `sketch/app.js`: input, rendering, IndexedDB (database `sketch` v1, stores `sessions` and `kv`), recording, playback.
- **Coordinates:** a stroke point is `[x, y, pressure, dt]`. `x` and `y` are fractions of the sheet width, so 1.0 = the full sheet width. These are **sheet units** below.
- **Archive:** `history/v1/js/` is the old detail editor. **Reuse from it** (copy; don't import across folders):
  - `geom.js`: `formatLength` (architectural feet-inches to 1/16"), `dist`, `distToSeg`, `distToPolyline`, `angleDeg`.
  - `primitives.js`: `dimensionPrims` (ticks, extension-line gap and overshoot, text lift, reading direction) and `arrowPrims`. These are a good starting point for sections 9 and 10.
  - `vocab.js`: an older scale list.

---

## 3. Data model changes

### 3.1 Detail (new)

A detail is the unit of work. The current single sheet becomes the first detail.

```js
{
  id: 'd…',
  name: 'Wall at threshold',      // "detail name", hard-coded by the user
  scale: '3"=1\'-0"',             // key into SCALES (section 4)
  paperWidthIn: 11,               // Q1
  tags: ['wall', 'threshold'],    // section 5
  sheet: {
    strokes: [ /* as today, plus .shape (section 7) */ ],
    objects: [ /* notes and dimensions (sections 9 and 10) */ ]
  },
  snapshots: [ /* section 8.3 */ ],
  versions: [ /* section 8.4: { id, created, name, sheet } */ ],
  created, modified
}
```

### 3.2 Session (recording): additions

```js
{
  /* existing: id, title, created, duration, base, events, speech, audio */
  detailId: 'd…',
  mode: 'auto' | 'manual',
  audioOffset: 0,   // ms from t0 to when the MediaRecorder actually started (section 6.3)
  base: { strokes: [], objects: [] }   // base becomes { strokes, objects }; old sessions hold an array — treat an array as { strokes: arr, objects: [] }
}
```

New event types, alongside `add`, `undo`, and `clear`:

- `{ t, type: 'put', obj }`: a note or dimension created or changed. Store the full object.
- `{ t, type: 'del', id }`: an object removed.
- `{ t, type: 'mark' }`: from a Snapshot during recording. Forces a moment boundary.

`SK.stateAt` returns `{ strokes, objects }`. `SK.segment` counts `put` and `del` as activity. A `mark` always closes the current moment.

### 3.3 IndexedDB v2 migration

- Bump to version 2 and add a `details` store (keyPath `id`).
- Keep the `sessions` store and add an index on `detailId`.
- **Migration:** if `kv.sheet` exists, create detail "Untitled detail" with those strokes. Give every existing session that detail's id and `mode: 'manual'`.
- `kv.currentDetail` holds the open detail's id.
- Write a Node test for the pure part: a `migrate(sheetArray, sessions)` that returns `{ detail, sessions }`.

### 3.4 Undo history (unified)

One stack per detail, in memory. Each entry is an operation with its inverse:

`addStroke` / `removeStroke`, `putObject(before, after)`, `deleteObject`, `clear(before)`.

- Undo and redo replay these.
- When recording, each undo or redo also writes the matching event (`undo`, `put`, `del`) so replay matches the screen.
- The stack is cleared when switching details.

---

## 4. Scale and units (`sketch/units.js`, pure, tested)

```js
SCALES = [
  { key: '6"=1\'-0"',      factor: 2 },   // factor = real inches per paper inch
  { key: '3"=1\'-0"',      factor: 4 },
  { key: '1 1/2"=1\'-0"',  factor: 8 },
  { key: '1"=1\'-0"',      factor: 12 },
  { key: '3/4"=1\'-0"',    factor: 16 },
  { key: '1/2"=1\'-0"',    factor: 24 },
  { key: '1/4"=1\'-0"',    factor: 48 },
  { key: 'Full size',      factor: 1 },
  { key: 'NTS',            factor: null } // not to scale: no automatic numbers
]
```

- `paperIn(u, detail) = u * detail.paperWidthIn`
- `realIn(u, detail) = paperIn(u) * factor`, or `null` when NTS.
- `paperToSheet(inches, detail) = inches / detail.paperWidthIn`. Text, arrow, and tick sizes are set in paper inches and converted with this. This is what "automatically scaled" means for graphics.
- `formatLength(realInches, roundTo = 1/16)`: port from `history/v1/js/geom.js` and add a rounding argument.
- **Tests:** 3"=1' with an 11" sheet means a stroke 0.5 sheet units long is 5.5" of paper, which is 22" real, formatted as `1'-10"`. NTS gives `null`.

### 4.1 Detail title on the sheet (lower left)

- Drawn as a DOM overlay in the lower left, following drafting convention: **detail name** underlined, with **SCALE: 3" = 1'-0"** and a small **graphic scale bar** (0, 6", 1', 2') beneath.
- Bar lengths come from the current scale: px per real foot = `W / paperWidthIn * 12 / factor`.
- The title is hidden for NTS; it shows "NOT TO SCALE" instead.
- **Tap the name:** opens Project info.
- **Tap the scale line:** opens a small picker with the SCALES list.
- **Drag horizontally on the scale line** with a finger or pen: steps through the list. Each 40 px of drag is one step; release confirms. While dragging, a large label shows the scale under the finger.
- The overlay sits above the canvas, so touches on it never draw.
- It is also painted into thumbnails and snapshots, so the log shows the scale.
- Changing the scale is an undoable operation (`putDetailMeta`) and is logged as an event.

---

## 5. Project info panel

Opened from the rail (top icon) or by tapping the detail title. It replaces the old drawer's top section. The gear keeps app settings.

- **Detail name:** a text field, saved as typed.
- **Scale:** the same list as 4.1.
- **Tags:**
  - Toggle chips for the fixed set: `wall`, `threshold`, `door`, `window`, `roof`, `foundation`, `slab edge`, `parapet`. The first three were asked for; the rest are common detail types, so drop any you don't want.
  - A "+ custom" field. Enter adds a chip.
  - Custom tags are remembered across details (`kv.customTags`) and offered as chips after first use.
  - Tapping a chip toggles it.
- **Versions:** the Save list (8.4), each with Restore.
- **Details:** "New detail", plus a list of other details (name, date, thumbnail). Tap one to switch.

---

## 6. Recording: auto, plus manual override

### 6.1 State machine

```
idle ──pen down──▶ auto ──(5 s with no pen, note or dimension activity)──▶ save ──▶ idle
 │                  │
 │                  └──Record button──▶ manual (the same session becomes mode 'manual')
 └──Record button──▶ manual ──Record button──▶ save ──▶ idle
```

- `AUTO_STOP_MS = 5000`, counted from the last pen-up or annotation commit. A new pen-down cancels the countdown.
- Moments inside a session still split at `IDLE_MS = 3000` (Q: "I like the three second delay", so keep it).
- In manual mode the 5 s timer is off. Only the Record button stops the recording.
- The page stops any recording when the tab becomes hidden (`visibilitychange`).

### 6.2 Indicators (not buttons)

- **Auto:** a small hollow red ring at top left. During the last 5 s it drains like a clock, so you can see when it will stop.
- **Manual:** a solid red dot with "REC" and the time.
- The rail's Record icon shows the same states, and is how you start or stop manual recording.

### 6.3 Fast start and audio alignment

- Ask for the mic once, on the first pen-down after load. Keep the `MediaStream` open while the page is visible.
- On pen-down, `t0 = performance.now()` immediately, so the stroke is timed from t0. Then `recorder.start()`.
- Set `session.audioOffset` to the time from t0 to the recorder's `start` event.
- **Playback** sets `audio.currentTime = (T - audioOffset) / 1000`. When that is negative, it waits and then starts the audio.
- The very first recording after load loses a fraction of a second of sound while permission resolves. That is acceptable.
- Speech recognition starts with each session, as now. Its text is timed against the same t0.

---

## 7. Shape reading (`sketch/shapes.js`, pure, tested)

`SK.classify(stroke) → { kind, confidence, info }`, where `info` holds things like `{ angleDeg, corners, closed }`. It runs on pen-up and is stored on the stroke as `stroke.shape`.

**Kinds:** `dot`, `line`, `polyline`, `arc`, `circle`, `ellipse`, `triangle`, `rectangle`, `closed shape`, `zigzag`, `unsorted`.

**Algorithm.** All thresholds are relative to the stroke, so they don't depend on window size.

1. Path length L. If L < 0.004 sheet units, the stroke is a `dot`.
2. `closed` = distance from first to last point < 12 % of L.
3. Simplify with Ramer-Douglas-Peucker, using ε = max(2 % of the bounding-box diagonal, 0.0015).
4. **Open strokes:**
   - 2 simplified points → `line`. Within 5° of horizontal or vertical, add `info.orient = 'horizontal' | 'vertical'`.
   - Otherwise fit a circle by least squares. If RMS residual < 6 % of r and the sweep is > 30°, it is an `arc`.
   - Otherwise count direction reversals along the main axis. ≥ 4 reversals with similar amplitude is a `zigzag` (often batt insulation).
   - Otherwise a `polyline` with n segments.
5. **Closed strokes:**
   - Circle fit residual < 8 % of r: a `circle` if the bounding-box aspect is between 0.8 and 1.25, otherwise an `ellipse`.
   - Else, by simplified corner count: 3 is a `triangle`; 4 with all angles 90° ± 15° is a `rectangle`; anything else is a `closed shape`.
6. Anything left, or confidence < 0.5, is `unsorted`.

**Describe:**

- `SK.describe(shape, stroke, detail)` returns text like `"line, horizontal, 1'-4\""` or `"rectangle, 6\" × 1'-2\""`, using units.js. No length is given when the scale is NTS.
- `SK.summarize(strokes)` returns `"2 lines, 1 rectangle, 1 unsorted"` for a log card.

**Tests:** synthetic strokes for each kind (a straight run with ±0.3 % noise, a 90° arc, a closed circle, a rectangle, a zigzag, a scribble).

**Settings:** "Show shape labels" (off by default) draws small gray labels at each stroke's start.

---

## 8. Log panel, Snapshot, Save, Undo

### 8.1 Log (rail icon)

- A full-width panel from the bottom, about 60 % of the height. It is a **horizontal film strip** you can scroll back and forth.
- It covers all recordings and snapshots for the current detail, oldest on the left. It opens scrolled to the newest.
- Cards are grouped by day, with a session divider (time, auto or manual, length).
- **Each card:**
  - A thumbnail of the sheet at the moment's end (as now).
  - The time.
  - The **first ~8 words** of what was said, ending in "…".
  - The shape summary (7).
  - Its tags.
- **Tap a card:** it expands in place. You get the full text, a ▶ to play just that moment's audio (seek to `start - audioOffset`, stop at `end`), "Open in replay" (the existing player, positioned at the moment), and tag chips.
- **Thumbnails:** make them lazily with `IntersectionObserver`. Cache them in IndexedDB under `kv.thumb:<sessionId>:<momentId>` so the strip stays fast.

### 8.2 Undo (rail icon)

- Uses the unified stack in 3.4.
- Long press means Redo (Q12).
- Disabled during replay.

### 8.3 Snapshot (rail icon)

- Creates `{ id, created, state: clone of { strokes, objects }, scale, thumb, tags: [], note: '' }` in `detail.snapshots`.
- If a recording is running, it also pushes a `mark` event.
- A brief white flash confirms it.
- Shows in the log with a camera mark.

### 8.4 Save (in Project info, and Ctrl+S)

- Asks for an optional name (default "v3, Oct 27 14:05").
- Stores `{ id, created, name, sheet: clone }` in `detail.versions`.
- **Restore** replaces the sheet, after confirming. The replaced sheet is first saved as an automatic version, so a restore is never lossy.

---

## 9. Text notes with leaders (rail icon: Text)

Follows drafting practice for multi-leader notes.

### 9.1 Data

```js
{
  id, type: 'note',
  text: 'SELF-ADHERED MEMBRANE, LAP 4" MIN.',
  at: [x, y],          // top-left of the text box (start point), in sheet units
  width: 0.25,         // box width in sheet units (the extent); text wraps inside it
  height: null,        // null = auto from wrapped lines; a number = manual (extra text is clipped, with a small "…" marker)
  textSizeIn: 3/32,    // paper inches; default 3/32" (about 2.4 mm), the common US note height
  justify: 'auto',     // 'left' | 'right' | 'auto' (auto = the side the leaders come from)
  leaders: [
    { id, tip: [x, y], bends: [], arrow: 'filled' }
  ]
}
```

### 9.2 Arrowheads (shared with dimensions)

| Key | Look | Typical use |
|---|---|---|
| `filled` | closed, filled triangle, 3:1 | Default for notes |
| `open` | two strokes, 30° | Lighter notes |
| `closed` | closed triangle, not filled | Some office standards |
| `dot` | filled dot | Pointing *into* a material or area, not at an edge |
| `tick` | 45° slash | Dimension default (architectural) |
| `none` | nothing | Leader without an arrowhead |

Size: arrows 1/8" long on paper, dots 1/16" across, ticks 1/8". All are converted through `paperToSheet`.

### 9.3 Geometry (`sketch/annot.js`, pure, tested)

`SK.noteLayout(note, detail, measureText) → primitives`. The renderer only draws primitives (lines, polygons, text runs). Tests pass a fake `measureText` (character count × 0.6 × height).

- **Wrapping:** wrap the text to `width`. Line height is 1.5 × text size. Auto height = lines × line height.
- **Leader attachment:** a leader attaches to the side of the box nearest its tip. If the tip's x is left of the box centre, it attaches on the left; otherwise on the right. The attachment point is level with the **middle of the first line**.
- **Landing:** a horizontal shoulder 1/8" long on paper, from the attachment point outward. The path is tip → bends → shoulder end → attachment point.
- **Leader angle:** the convention is that leaders are never horizontal or vertical. While dragging a tip, snap the last segment to 30°, 45°, or 60° when within 5°. Hold a second finger, or Shift, to snap freely.
- With `justify: 'auto'` the text is right-aligned when all leaders attach on the left side, and left-aligned otherwise.

### 9.4 Interaction

**Create:**

1. Tap **Text**. A one-line hint shows at the top: "Tap the arrow point."
2. Tap the arrow point. It snaps to the nearest stroke point within 12 px.
3. Then: "Tap or drag where the text starts." A tap uses a default width of 2" on paper. A drag sets the width by its horizontal length, and the drag direction picks the side.
4. A textarea opens over the box. On the iPad the keyboard or Scribble handwriting works there.
5. Tap Done, or outside, to commit. Empty text cancels.

**Select:** a *tap*, not a drag, on a note's text or leader selects it. A drag still draws. A tap means under 6 px of movement and under 250 ms. Tap empty space to deselect.

**Handles on a selected note:**

- A square at each leader tip (drag to move).
- A small circle at each bend. Double-tap a leader segment to add a bend; double-tap a bend to remove it.
- A square at the box start (drag to move the whole note).
- A right-edge handle (drag to change the width).
- A bottom-edge handle (drag to set a manual height; double-tap it to go back to auto).

**Chips on a selected note** (a small floating row above the box):

- `+ Arrow`: then tap a new tip point.
- `Arrow ▾`: the styles from 9.2. Applies to the selected leader, or to all leaders if the box is selected.
- `− Arrow`: removes the selected leader. Only shown when there are 2 or more.
- `Edit text`
- `Size ▾`: 3/32", 1/8", 3/16", Custom.
- `Delete`

Every change is a `putObject` (undoable, and recorded as a `put` event).

---

## 10. Dimensions (rail icon: Dimension)

### 10.1 Data

```js
{
  id, type: 'dim',
  mode: 'ortho' | 'aligned' | 'angular',
  p1: [x, y], p2: [x, y],
  vertex: [x, y],      // angular only: p1 and p2 lie on the two rays
  orient: 'h' | 'v',   // ortho only
  offset: 0.05,        // signed distance of the dimension line from the measured points (sheet units); for angular, the arc radius
  text: null,          // null = automatic; a string = override; '<>' inside the string is replaced by the measured value (AutoCAD convention, e.g. '<> CLR.')
  textSizeIn: 3/32,
  terminator: 'tick',  // keys from 9.2
  roundTo: 1/16        // null = use the Settings default
}
```

### 10.2 Geometry (`sketch/annot.js`, pure, tested)

`SK.dimLayout(dim, detail, measureText) → primitives`. Start from `history/v1/js/primitives.js` `dimensionPrims`.

- **Extension lines:** start 1/16" (paper) away from the measured point and run 1/8" past the dimension line.
- **Dimension line:** runs 1/16" past the ticks when the terminator is a tick. It stops at the arrows when the terminator is an arrow.
- **Text:** centred, 1/16" above the dimension line, readable from the bottom or the right side. If the text is wider than the dimension line, move it outside, to the side the drag ended on.
- **Value:**
  - ortho: |Δx| or |Δy| depending on `orient`
  - aligned: the true distance
  - angular: degrees to 0.5°
  - Lengths go through `realIn` and `formatLength(roundTo)`.
  - With NTS and no override, show the paper length followed by "NTS" in gray, so it is obvious it needs an override.

### 10.3 Interaction

**Create:**

1. Tap **Dimension**. A chip row appears: `Ortho · Aligned · Angular`. It remembers the last choice; Ortho is the default.
2. **Ortho or Aligned:** tap the first point, then the second. Both snap to stroke ends, corners from the shape reader, and note or dimension points within 12 px. Then **drag out the dimension line** and release to place it.
3. **Ortho direction** follows AutoCAD's DIMLINEAR: drag above or below the two points and you get a horizontal dimension; drag left or right of them and you get a vertical one.
4. **Angular:** tap the vertex, a point on the first ray, and a point on the second ray. Then drag out the arc radius. The side you drag to picks the inside or outside angle.

**Select:** by tap, as with notes.

**Handles:** the measured points (re-measure), the dimension line (drag to change the offset), and the text (drag along the line).

**Chips:**

- `Mode ▾`
- `Text…`: shows the measured value and an override field, plus "Use measured" to clear the override.
- `End ▾`: terminators.
- `Round ▾`
- `Delete`

**"Automatic scaled dimensions with manual override":**

- The number always comes from geometry × scale unless it is overridden.
- Every graphic size (text, ticks, gaps) is in paper inches, so it looks the same at any scale.
- Each size can be overridden per dimension (`textSizeIn`, `terminator`, `roundTo`).
- Notes follow the same rule.

---

## 11. Build order and acceptance checks

Each step ends with `node tests/sketch-core.js` (and the new test files) passing, plus the manual check in the browser. Use the headless e2e approach from 001 (Playwright, fake mic flags) where it fits.

| Step | Scope | Done when |
|---|---|---|
| A | `units.js` + `annot.js` stubs, data model, IndexedDB v2 migration, unified undo | Old data opens as "Untitled detail". Undo and redo work across strokes. Migration test passes. |
| B | Icon rail, Project info (name, scale, tags, details list), detail title + scale bar on the sheet, scale picker and drag | Changing the name or scale shows on the sheet at once. A scale drag steps through the list. Touches on the title never draw. Tags persist. |
| C | Auto-record state machine, manual override, `audioOffset`, indicators | Pen-down starts a recording. It saves about 5 s after the last pen-up. Record makes it manual. A replay's audio lines up. |
| D | Log film strip, Snapshot, Save and versions | The strip shows every moment and snapshot for the detail, with ~8-word text. Tap expands it and plays just that clip. A restore is undoable through an automatic version. |
| E | `shapes.js` + log summaries + optional sheet labels | All classifier tests pass. Log cards read e.g. "2 lines, 1 rectangle". |
| F | Notes with leaders (9) | Create, edit text, add/remove/move leaders, change arrow style, change width and height, and undo, all on the iPad. Replay shows notes appearing at the right time. |
| G | Dimensions (10) | Ortho by drag direction, aligned, and angular. The value matches the scale. An override with `<>` works. A scale change updates the values and keeps the graphics the same size. |

### Files after 002

```
index.html
sketch/core.js       stateAt (strokes + objects), segment, events
sketch/units.js      SCALES, conversions, formatLength           (new, pure)
sketch/shapes.js     classify, describe, summarize               (new, pure)
sketch/annot.js      noteLayout, dimLayout, arrowheads, hit test (new, pure)
sketch/store.js      IndexedDB v2 + migration                    (split out of app.js)
sketch/app.js        input, tools, rail, panels, rendering
sketch/style.css
tests/sketch-core.js, tests/units.js, tests/shapes.js, tests/annot.js
```

The pure files use the same wrapper as `core.js`, so they work both in the browser (`window.SK`) and in Node (`module.exports`).

---

## 12. Not in this increment

- Zoom and pan of the sheet.
- Turning a recognised shape into clean geometry.
- Export (PDF/DXF) of the new sheet. The old editor in `history/v1` has exporters to borrow later.
- AI description of whole drawings (Q13).
- Hatches.
