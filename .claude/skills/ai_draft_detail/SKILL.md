---
name: ai_draft_detail
description: Draft a new detail on the canvas with the AI. Lays out options (A) and variations (B) for each hatch in a list, spaced out, with numbered annotations, names it, and saves it as a new row in the cloud library. Tags it AI and draft. Use when the user says "ai_draft_detail [hatch set or subject] [layout] [name]".
---

# ai_draft_detail

Adapted from `ai_collab`. Where `ai_collab` marks up a detail that exists, this skill makes a new one. The drawing is the AI's draft, so every item is tagged and every id is prefixed. Nothing is overwritten.

## Invocation

`ai_draft_detail [hatch set or subject] [layout] [name]`

- **Hatch set**: which hatches to draw. Examples: `classical` (the existing hatch keys that draw today), a list of keys, or a subject such as `masonry`. If the user gives none, ask. Do not guess a set.
- **Layout**: how options and variations are spaced. Default: one row per hatch, option A on the left, variation B to its right, annotation to the far right, rows 16 real inches apart.
- **Name**: the detail's name. If the user gives none, propose one that says what it is and mark it as an AI draft, for example `Classical hatch set, options and variations (AI draft)`.

## Definitions

- **Option A**: the hatch as the key draws it today, in a small swatch (8 by 4 real inches).
- **Variation B**: the same key in a larger patch (24 by 12 real inches), so the reader sees how the fill repeats over a larger area. Hatch spacing is on paper, so a larger patch shows more repeats, not finer lines.
- **Annotation**: a numbered note beside each row. It names the hatch and its palette number (for example P-01), says what the reader sees, and says what is still to decide.

Numbers are tracked in `docs/hatch/palette-plan.md`. Keep them the same.

## Text size

- Notes are 4 times the earlier size when the detail is an asset sheet. Set the `text_scale` key in the spec, and apply it to every note's `size` after `SK.authorDetail`: `size = SK.PAPER.text * text_scale`. Record it in the row's metadata.

## Confidence

- When a detail offers versions, give each a confidence score from 0 to 1 for how well it matches the reference. Say in one line why. Use 0 for a placeholder where no key exists.

## Steps

1. **Read the set.** Check every key in `sketch/hatch.js` (`SK.HATCHES`). A key that does not exist is not drawn. Report it and leave its row empty. Never invent a key.
2. **Plan the canvas.** For each hatch, write one row: its number, its key, option A, variation B, and an annotation. Rows are spaced 16 real inches apart, so no swatch touches the next row.
3. **Write the spec** to `docs/examples/<short-name>.json`, following `sketch/author.js`. Set `"ai_inferred": true` and tags `AI` and `draft`. Every note has a tip (where its arrow points).
4. **Check it builds.** In Node, load `sketch/core.js`, `units.js`, `hatch.js` and `author.js`, then call `SK.authorDetail(spec)`. Then call `SK.hatchPrims` for every hatch item. A spec that throws, or a hatch that returns no fill, is not done.
5. **Render and look.** Draw the result to a PNG in `docs/hatch/review/` for the user to review. Look at it before saving. Check orientation, density, and that notes do not overlap swatches.
6. **Save to the cloud.** Insert one new row into `public.sketch_details`:
   - `local_id`: `ai-draft-<short-name>`. Check first that no row has that id.
   - `name`: the name from the invocation.
   - `scale`: `3"=1'-0"` unless the spec says otherwise.
   - `tags`: `AI`, `draft`, and the subject, for example `hatch`.
   - `items`: the bare array from `SK.authorDetail(spec).items`. It must be an array, not an object.
   - `metadata`: `{"ai_inferred": true, "source": "<spec path>", "skill": "ai_draft_detail"}`.
   Insert, never update. Do not touch any other row.
7. **Verify.** Re-read the new row. Confirm the item count matches the spec, the tags include `AI` and `draft`, and the name is as given.
8. **Report.** Give the row's `local_id`, the item count, the spec path, the render path, and what each row shows. List what is still open for review.

## Rules

- This skill writes only one new row per run, and only to `sketch_details`. It never writes to `table_index` or the other tables.
- Every id in the spec and the row starts `ai-draft-`, so a run can be found and removed as a set.
- Tag every output `AI` and `draft`. A human-drawn detail is never tagged AI.
- Never claim a detail is code-compliant, or that a hatch matches a listed assembly. Every draft carries a "Draft: verify before use" note.
- If the insert fails, report the error and leave no partial row. A failed insert is checked before retrying.
- Commit only when the user asks. The spec and render are the review copy.
