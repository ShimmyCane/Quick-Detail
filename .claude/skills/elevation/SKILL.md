---
name: elevation
description: Draft an elevation on the canvas with the AI. Stub: scope and structure only, not yet built. Use when the user says "elevation [subject] [increments] [name] [flags]" once the skill is built out.
---

# elevation

Status: **stub**. The shape below follows `ai_draft_detail`. The steps are placeholders until this drawing type is worked out.

Scope: exterior or interior elevations: one face of a building or wall, with openings, levels and materials.

## Input

`elevation [subject] [increments] [name] [flags]`

- **Subject**: Elevation to draw, in words. Ask for clarification if it is unclear.
- **Increments**: same forms as `ai_draft_detail` (`3`, `3 steps`, `3 inc`). Default 1.
- **Name**: as `ai_draft_detail`. Mark drafts "(AI draft)".
- **Flags**: `[research]`, `[no input]`, `[dry run]`, as `ai_draft_detail`.

## Validation

Restate the command, ask clarifying questions in one batch, and check database access to the viewer tables (`viewer_sets`, `viewer_scenes`), as `ai_draft_detail` does.

## Steps (placeholder)

1. Validate.
2. Research (if `[research]`) in `research/detail/elevation/`.
3. Read the subject against the existing examples for this drawing type.
4. Plan the increments.
5. Write the generator in `tools/generator/elevation.js`. elevation.js does not exist yet.
6. Check notes with `tools/note-blocks.js`.
7. Draw into the canvas with `tools/draw-canvas.js`.
8. Look at the renders.
9. Track versions in `viewer_sets` and `viewer_scenes`.
10. Report.

## Output

- Canvas: each increment as a new canvas detail, tagged `AI` and `draft`.
- Files: specs in `docs/examples/<name>/`, research and PNGs in `research/detail/elevation/<name>/`.

## Rules

- Tag every output `AI` and `draft`, with a "Draft: verify before use" note.
- Never claim code compliance or a rated assembly.
- Cloud writes go only to `viewer_sets` and `viewer_scenes`.
