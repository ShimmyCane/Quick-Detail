---
name: isometric
description: Draft an isometric (axonometric) drawing on the canvas with the AI, from a chosen view, of an assembly or a building massing. Works in increments, each one a new canvas detail. Use when the user says "isometric [subject] [increments] [name] [flags]".
---

# isometric

Status: **best-guess draft, for review.** No generator exists yet. The shape below is a guess, to be reviewed before anything is built.

Adapted from `ai_draft_detail`. Same validation, output, and rules, with projection-specific steps.

Scope: isometric views of an assembly (such as a roof edge or a wall corner) or a building massing. Plans, elevations, and sections are out of scope.

## Input

`isometric [subject] [increments] [name] [flags]`

- **Subject**: what to draw, in words, for example "parapet and scupper corner, CMU, 3 courses high".
- **View**: the corner or direction the view looks from, such as `NE`, `SE`, `SW`, `NW`. Default `NE`.
- **Projection**: `isometric` (30° axes, the default) or `axonometric` (other angles, by agreement).
- **Exploded**: `[exploded]` offsets each layer along its normal, so layers read. Off by default.
- **Increments**: `3`, `3 steps`, `3 inc`. Default 3.
- **Name**: as `ai_draft_detail`.
- **Flags**: `[research]`, `[no input]`, `[dry run]`.

## Validation

Restate the command, including the view. Ask in one batch: which corner or side is visible, whether the view is exploded, and whether a plan or elevation exists to check against. Check database access to `viewer_sets` and `viewer_scenes`.

## Scale and text

- Scales from `SK.SCALES`. An isometric detail is usually `3"=1'-0"`, or the same scale as the matching plan.
- Positions are real inches in 3D, projected to 2D by the generator. The spec holds the 2D result.
- Dimensions only along the three axes, in real inches. Labels are short (1 to 3 words) and placed off the drawing.

## Steps

1. **Validate.** Run the Validation section. Wait for answers.
2. **Research** (only with `[research]`). Save in `research/detail/isometric/<name>/`. Look for a published isometric of the same assembly.
3. **Read the subject.** Look at existing examples in `docs/examples/`. Define the 3D model first: each part as a box or a profile with real dimensions. Flag any part without a dimension as a placeholder.
4. **Plan the increments.** Best guess:
   - Increment 1: the main mass or substrate (for example, the CMU wall and its footing).
   - Increment 2: the layers on top (flashing, membrane, cap).
   - Increment 3: hidden-line clean-up, dimensions, and labels.
5. **Write the generator** in `tools/generator/isometric.js`, which does not exist yet. It needs a projection helper, which turns (x, y, z) in real inches into 2D with the chosen view, and a hidden-line pass, or the spec will show lines through solid parts.
6. **Check notes** with `tools/note-blocks.js`.
7. **Draw into the canvas** with `tools/draw-canvas.js`.
8. **Look at the renders.** Check that the view matches the stated corner, and that no part shows through another.
9. **Track versions** in `viewer_sets` and `viewer_scenes`.
10. **Report** each increment, with any part that was a placeholder.

## Output

- Canvas: each increment is a new canvas detail, tagged `AI` and `draft`.
- Files: specs in `docs/examples/<name>/`. Research and PNGs in `research/detail/isometric/<name>/`.
- Version records in `viewer_sets` and `viewer_scenes`.

## Rules

- Tag every output `AI` and `draft`, with a "Draft: verify before use" note.
- A view is not a verified construction drawing. Never use it as a basis for a dimension or a quantity.
- Cloud writes go only to `viewer_sets` and `viewer_scenes`.

## Open questions for review (best guesses)

- Is the default view NE, and is 30° the right default projection?
- Who builds the hidden-line pass: the generator, or a viewer feature?
- Should exploded views be a separate skill?
