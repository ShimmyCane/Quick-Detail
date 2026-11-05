---
name: isometric
description: Draft an isometric (axonometric) overlay on the canvas with the AI, always alongside siteplans, plans, and elevations. Builds a separate block of grid lines and control points, then overlays the isometric on the other drawings. Stub: rough, to be refined. Use when the user says "isometric [subject] [increments] [name] [flags]".
---

# isometric

Status: **stub.** This skill is a first attempt: overlay and try your best. Expect rough output. No generator exists yet.

Scope: isometric massing that sits over the site plan, floor plans, and elevations of the same building. It is not a standalone detail.

## Input

`isometric [subject] [increments] [name] [flags]`

- **Subject**: the building or massing, in words, and the drawings it sits with (site plan, plans, elevations). Required: at least one of these must already exist, or be drafted first.
- **View**: the corner the view looks from, such as `NE`. Default `NE`.
- **Increments**: `3`, `3 steps`, `3 inc`. Default 3.
- **Name**, **flags**: `[research]`, `[no input]`, `[dry run]`, as `ai_draft_detail`.

## Validation

Restate the subject, view, and the drawings it sits with. Confirm each of those drawings exists. If one is missing, ask whether to draft it first (with `siteplan`, `floor_plan`, or `elevation`). Check database access to `viewer_sets` and `viewer_scenes`.

## Scale and text

- Use the scale of the drawings it overlays, so the isometric and the plans agree.
- Positions in real inches, projected to 2D by the generator.
- Labels are few and short.

## Steps

1. **Validate.** Run the Validation section. Wait for answers.
2. **Control block.** Draw a separate block of grid lines and control points first. Each control point is a real-inch corner of the building, taken from the site plan, plans, and elevations. The block is its own layer, so it can be turned off.
3. **Overlay.** Project the massing onto the control block for the chosen view. Try to match the corners to the control points, and report every corner that does not match.
4. **Plan the increments.** Cumulative:
   - Increment 1: control block and the main massing.
   - Increment 2: the roof and the openings.
   - Increment 3: labels and the view name.
5. **Draw.** Write the generator in `tools/generator/isometric.js`, which does not exist yet. It needs a projection helper and a hidden-line pass. Write one spec per increment to `docs/examples/<name>/`, and draw with `tools/draw-canvas.js`.
6. **Check text.** Run `tools/note-blocks.js`.
7. **QC.** Check that each control point lands on its corner, and that the view matches the stated corner.
8. **Track versions** in `viewer_sets` and `viewer_scenes`.
9. **Report** each increment and every corner that did not match.

## Output

- Canvas: each increment is a new canvas detail, tagged `AI` and `draft`.
- Specs in `docs/examples/<name>/`.
- Control block and PNGs in `research/detail/isometric/<name>/`.
- Version records in `viewer_sets` and `viewer_scenes`.

## Rules

- Tag every output `AI` and `draft`, with a "Draft: verify before use" note.
- A stub overlay is not a construction drawing. Never use it for a dimension or quantity.
- Cloud writes go only to `viewer_sets` and `viewer_scenes`.

## Open questions for review

- Should the control block be a separate spec, so the other drawings can reuse it?
- Who writes the hidden-line pass, and is it in scope for this stub?
