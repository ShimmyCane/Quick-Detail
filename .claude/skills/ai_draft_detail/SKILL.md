---
name: ai_draft_detail
description: Draft a new detail or drawing on the canvas with the AI. Writes a drawing spec (lines, rectangles, hatches, notes, dimensions in real inches), checks it with SK.authorDetail, and draws it into the Quick Detail canvas as a new detail, tagged AI and draft. Works in increments, each one a new canvas detail. Use when the user says "ai_draft_detail [subject or hatch set] [layout] [name]".
---

# ai_draft_detail

Adapted from `ai_collab`. Where `ai_collab` marks up a detail that exists, this skill makes a new one, and draws it into the canvas. The drawing is the AI's draft, so every item is tagged and every spec carries a "Draft: verify before use" note. Nothing existing is overwritten.

## Invocation

`ai_draft_detail [subject or hatch set] [layout] [name]`

- **Subject**: what to draw, for example a hatch set (`classical`), a list of hatch keys, or a building site such as `Torrance Cultural Arts Center site plan`.
- **Increments**: how many steps to draw. Default 1. Each increment is a full, cumulative drawing and becomes its own canvas detail, so the last one holds everything.
- **Layout**: how items are spaced. For a hatch set: one row per hatch, option A on the left, variation B to its right, annotation to the far right, rows 16 real inches apart. For a site or plan: the drawing's own geometry.
- **Name**: the detail's name. If none is given, propose one that says what it is and mark it "(AI draft)".
- **No user input**: when the user says so, pick the sensible defaults, and say in the report which reading was taken.

## Definitions

- **Option A**: a hatch as its key draws it today, in a small swatch (8 by 4 real inches).
- **Variation B**: the same key in a larger patch (24 by 12 real inches), so the fill's repeat is visible.
- **Annotation**: a note beside each row. It names the item and its palette number (for example P-01), says what the reader sees, and says what is still to decide.

Palette numbers are tracked in `docs/hatch/palette-plan.md`. Keep them the same.

## Scale and text

- Scales come from `SK.SCALES` in `sketch/units.js`. The smallest one is `1/4"=1'-0"` (factor 48), so a site plan of several hundred feet is large on the canvas. The Rand Hall sheet uses `1/4"=1'-0"` too.
- Positions are real inches: feet times 12 for a site.
- Notes are sized with `text_scale` in the spec. At `1/4"=1'-0"`, the default text is too small to read at fit-to-view, so a site plan uses `text_scale: { "title": 24, "note": 24, "small": 16, "dim": 16 }`.
- A label that is 1 to 3 words is a label, and one line is right. Anything longer is a block: 4 to 10 words a line (see `note_text_blocks`).

## Confidence

- When a drawing offers versions, give each a confidence score from 0 to 1 for how well it matches the reference, with one line on why. Use 0 for a placeholder where no key exists.

## Steps

1. **Read the subject.** For a hatch set, check every key in `sketch/hatch.js` (`SK.HATCHES`). A key that does not exist is not drawn: report it and leave its row empty. Never invent a key. For a site or building, state the assumptions (streets, footprints, trees) and mark them as placeholders.
2. **Plan the increments.** Write the steps in order: base layer (streets, boundary or first rows), then the next layer, then the last. Each increment repeats the earlier layers, so it stands alone.
3. **Write the generator** in `tools/<name>.js`, following the pattern in `tools/torrance-cac.js`. It writes one spec per increment to `docs/examples/<name>/`. Each spec has `name`, `scale`, `tags` (including `AI` and `draft`), `ai_inferred: true`, `text_scale`, and `items`. Every note has a `tip`. Run it and fix any spec that throws.
4. **Check the notes.** `node tools/note-blocks.js docs/examples/<name>/*.json`. Fix any note the checker flags, by changing its width or its wording.
5. **Draw into the canvas.** `node tools/draw-canvas.js docs/examples/<name>/*.json --out docs/<name>/review`. This opens the app in headless Chromium, calls `window.QuickDetail.draw(spec)` for each spec (the same path as the JSON panel's "Create detail"), fits the view, and saves a PNG per increment. Exit code 1 means a spec failed or the page threw. Fix it and run again.
6. **Look at the renders.** Check orientation, that labels read, that notes do not sit on the drawing where they hide it, and that the draft note is there. Note any overlap in the report.
7. **Report.** Give each increment's name, item count, spec path, and PNG path. List what is still open for review, and any assumption that needs a survey or a reference.

## Rules

- Tag every output `AI` and `draft`. A human-drawn detail is never tagged AI.
- Every spec carries a "Draft: verify before use" note. Never claim a detail is code-compliant, or that a hatch matches a listed assembly.
- This skill draws into the canvas only through `window.QuickDetail.draw`. It does not write to `sketch_details` or any other cloud table.
- Keep each increment cumulative, so the last one is the complete drawing.
- Commit, push, and merge only when the user asks. The specs, PNGs and generator are the review copy.
