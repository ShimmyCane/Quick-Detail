---
name: floor_plan
description: Draft a floor plan on the canvas with the AI: one level of a building, with walls, openings, rooms, grid lines, labels and dimensions. Works in increments, each one a new canvas detail. Use when the user says "floor_plan [subject] [increments] [name] [flags]".
---

# floor_plan

Status: **best-guess draft, for review.** No generator exists yet. The shape below is a guess, to be reviewed before anything is built.

Adapted from `ai_draft_detail`. Same validation, output, and rules, with floor-plan-specific steps.

Scope: one level of a building in plan: walls, openings, rooms, grid lines, labels, and dimensions. Site plans, elevations, sections, and isometrics are out of scope.

## Input

`floor_plan [subject] [increments] [name] [flags]`

- **Subject**: the level and what it holds, in words, for example "Level 1, lobby, two classrooms and a corridor".
- **Level**: the level's name and finished floor elevation, such as `L1, FFE 0'-0"`. Required.
- **Walls**: each wall type with its thickness and, where needed, a hatch tracking number from `research/detail/hatches.json`.
- **Openings**: doors and windows by tag. Tags refer to a schedule, and size comes from it.
- **Rooms**: each room's name and its area, if known. Areas are computed from the plan, not typed in.
- **Grid**: grid lines in feet, with names, such as `A` to `D` and `1` to `4`.
- **Increments**: `3`, `3 steps`, `3 inc`. Default 3.
- **Name**, **flags**: as `ai_draft_detail`.

## Validation

Restate the command, including the level and the grid. Ask in one batch: the overall building dimensions, the wall thicknesses, the opening tags and sizes, and whether a schedule exists to read them from. Check database access to `viewer_sets` and `viewer_scenes`.

## Scale and text

- Scales from `SK.SCALES`. A plan is usually `1/8"=1'-0"` for a whole level, or `1/4"=1'-0"` for part of one.
- Positions in real inches. Grid lines and walls are dimensioned from a common origin.
- Room labels: name and area, as a note of 1 to 3 words.

## Steps

1. **Validate.** Run the Validation section. Wait for answers.
2. **Research** (only with `[research]`). Save in `research/detail/floor-plan/<name>/`. Look for a published plan of the same building type.
3. **Read the subject.** Look at `docs/examples/` for plan patterns. Check every hatch tracking number against `research/detail/hatches.json`. Flag any room without a size as a placeholder.
4. **Plan the increments.** Best guess:
   - Increment 1: the grid, the exterior walls, and the building outline.
   - Increment 2: interior walls and openings, with tags.
   - Increment 3: rooms, labels, and dimensions.
5. **Write the generator** in `tools/generator/floor-plan.js`, which does not exist yet. It writes one spec per increment to `docs/examples/<name>/`.
6. **Check notes** with `tools/note-blocks.js`.
7. **Draw into the canvas** with `tools/draw-canvas.js`.
8. **Look at the renders.** Check that walls meet at corners, openings sit in their walls, and room labels sit inside their rooms.
9. **Track versions** in `viewer_sets` and `viewer_scenes`.
10. **Report** each increment, with placeholder rooms and openings.

## Output

- Canvas: each increment is a new canvas detail, tagged `AI` and `draft`.
- Files: specs in `docs/examples/<name>/`. Research and PNGs in `research/detail/floor-plan/<name>/`.
- Version records in `viewer_sets` and `viewer_scenes`.

## Rules

- Tag every output `AI` and `draft`, with a "Draft: verify before use" note.
- Never claim a room area, egress width, or accessibility clearance is correct without a code check.
- Cloud writes go only to `viewer_sets` and `viewer_scenes`.

## Open questions for review (best guesses)

- Should room areas be computed by the generator, or typed in and checked?
- Is 1/8"=1'-0" the right default for a whole level?
- Should egress and accessibility checks be a separate skill?
