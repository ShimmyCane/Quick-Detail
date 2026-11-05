---
name: floor_plan
description: Draft a floor plan on the canvas with the AI. Stub: scope and structure only, not yet built. Use when the user says "floor_plan [subject] [increments] [name] [flags]" once the skill is built out.
---

# floor_plan

Status: **stub**. The shape below follows `ai_draft_detail`. The steps are placeholders until this drawing type is worked out.

Scope: floor plans: one level of a building, with walls, openings, rooms and labels.

## Input

`floor_plan [subject] [increments] [name] [flags]`

- **Subject**: Floor plan to draw, in words. Ask for clarification if it is unclear.
- **Increments**: same forms as `ai_draft_detail` (`3`, `3 steps`, `3 inc`). Default 1.
- **Name**: as `ai_draft_detail`. Mark drafts "(AI draft)".
- **Flags**: `[research]`, `[no input]`, `[dry run]`, as `ai_draft_detail`.

## Validation

Restate the command, ask clarifying questions in one batch, and check database access to the viewer tables (`viewer_sets`, `viewer_scenes`), as `ai_draft_detail` does.

## Steps (placeholder)

1. Validate.
2. Research (if `[research]`) in `research/detail/floor-plan/`.
3. Read the subject against the existing examples for this drawing type.
4. Plan the increments.
5. Write the generator in `tools/generator/floor-plan.js`. floor-plan.js does not exist yet.
6. Check notes with `tools/note-blocks.js`.
7. Draw into the canvas with `tools/draw-canvas.js`.
8. Look at the renders.
9. Track versions in `viewer_sets` and `viewer_scenes`.
10. Report.

## Output

- Canvas: each increment as a new canvas detail, tagged `AI` and `draft`.
- Files: specs in `docs/examples/<name>/`, research and PNGs in `research/detail/floor-plan/<name>/`.

## Rules

- Tag every output `AI` and `draft`, with a "Draft: verify before use" note.
- Never claim code compliance or a rated assembly.
- Cloud writes go only to `viewer_sets` and `viewer_scenes`.
