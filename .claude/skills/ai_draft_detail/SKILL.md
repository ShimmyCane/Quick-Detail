---
name: ai_draft_detail
description: Draft a new construction detail on the canvas with the AI. Writes a drawing spec (lines, rectangles, fills, notes, dimensions in real inches), checks it with SK.authorDetail, and draws it into the Quick Detail canvas as a new detail, tagged AI and draft. Covers wall, roof, window, door and similar assembly details. Works in increments, each one a new canvas detail. Use when the user says "ai_draft_detail [subject] [increments] [layout] [name]".
---

# ai_draft_detail

Adapted from `ai_collab`. Where `ai_collab` marks up a construction detail that exists, this skill drafts a new one and draws it into the canvas. The drawing is the AI's draft, so every item is tagged and every spec carries a "Draft: verify before use" note. Nothing existing is overwritten.

Scope: construction details only, such as wall, roof, window, door, floor, and penetration assemblies. Site plans, floor plans, and building sections are out of scope.

## Invocation

`ai_draft_detail [subject] [increments] [layout] [name]`

- **Subject**: the assembly to draw, described in words, for example "exterior wall at a window head, CMU with 1-hour rating". A set of assemblies can be drawn in one run.
- **Increments**: how many steps to draw. Default 1. Each increment is a full, cumulative drawing and becomes its own canvas detail, so the last one holds everything.
- **Layout**: how details are arranged on the sheet. The default is one row per assembly family (walls, roofs, windows, doors, and a row for material hatches). Each row holds its details left to right, with a note to the right of them. Rows sit 16 real inches apart unless the spec needs more room. A single detail uses the layout of its own section.
- **Name**: the detail's name. If none is given, propose one that says what it is and mark it "(AI draft)".
- **No user input**: when the user says so, pick the sensible defaults, and say in the report which reading was taken.

## Scale and text

- Scales come from `SK.SCALES` in `sketch/units.js`. Details are normally drawn at a larger scale than the sheet, such as `3"=1'-0"` or `1-1/2"=1'-0"`. Check the scale against the detail's size before drawing.
- Positions are real inches. Dimensions are written in real inches as well.
- Notes are sized with `text_scale` in the spec. Set it so labels read at fit-to-view.
- A label that is 1 to 3 words is a label, and one line is right. Anything longer is a block: 4 to 10 words a line (see `note_text_blocks`).

## Confidence

- When a drawing offers versions, give each a confidence score from 0 to 1 for how well it matches the reference, with one line on why. Use 0 for a placeholder where no reference exists.

## Steps

1. **Read the subject.** Check every component the detail uses against the library and the spec format. A component that does not exist is not drawn: report it and leave it out. Never invent one. State the assumptions (layer thicknesses, substrate, fastener spacing, rating) and mark them as placeholders.
2. **Plan the increments.** Write the steps in order: base layer (substrate and structure), then the next layer (insulation, membrane, cladding), then the last (flashing, sealant, notes and dimensions). Each increment repeats the earlier layers, so it stands alone.
3. **Write the generator** in `tools/<name>.js`, following the pattern of the existing generators in `tools/`. It writes one spec per increment to `docs/examples/<name>/`. Each spec has `name`, `scale`, `tags` (including `AI` and `draft`), `ai_inferred: true`, `text_scale`, and `items`. Every note has a `tip`. Run it and fix any spec that throws.
4. **Check the notes.** `node tools/note-blocks.js docs/examples/<name>/*.json`. Fix any note the checker flags, by changing its width or its wording.
5. **Draw into the canvas.** `node tools/draw-canvas.js docs/examples/<name>/*.json --out docs/<name>/review`. This opens the app in headless Chromium, calls `window.QuickDetail.draw(spec)` for each spec (the same path as the JSON panel's "Create detail"), fits the view, and saves a PNG per increment. Exit code 1 means a spec failed or the page threw. Fix it and run again.
6. **Look at the renders.** Check orientation, that labels read, that notes do not sit on the drawing where they hide it, and that the draft note is there. Note any overlap in the report.
7. **Report.** Give each increment's name, item count, spec path, and PNG path. List what is still open for review, and any assumption that needs a product spec, a code check, or a reference.

## Rules

- Tag every output `AI` and `draft`. A human-drawn detail is never tagged AI.
- Every spec carries a "Draft: verify before use" note. Never claim a detail is code-compliant, rated, or meets a listed assembly.
- This skill draws into the canvas only through `window.QuickDetail.draw`. It does not write to `sketch_details` or any other cloud table.
- Keep each increment cumulative, so the last one is the complete drawing.
- Commit, push, and merge only when the user asks. The specs, PNGs and generator are the review copy.
