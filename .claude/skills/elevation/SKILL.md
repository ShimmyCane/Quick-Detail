---
name: elevation
description: Draft an exterior or interior elevation on the canvas with the AI: one face of a building or wall, with grade, floor levels, openings, and materials. Works in increments, each one a new canvas detail. Use when the user says "elevation [subject] [increments] [name] [flags]".
---

# elevation

Status: **best-guess draft, for review.** No generator exists yet. The shape below is a guess, to be reviewed before anything is built.

Adapted from `ai_draft_detail`. Same validation, output, and rules, with elevation-specific steps.

Scope: one face of a building or wall: exterior (north, south, east, west) or interior. Plans, sections, and isometrics are out of scope.

## Input

`elevation [subject] [increments] [name] [flags]`

- **Subject**: the face and what it shows, in words, for example "south elevation, two storeys, CMU with storefront at ground floor".
- **Orientation**: `N`, `S`, `E`, `W`, or `interior` with the wall's name. Required.
- **Levels**: floor levels in feet and inches, such as `FL 0'-0"`, `FL 12'-0"`. Required for an elevation.
- **Openings**: windows and doors on this face, by tag. Tags refer to a schedule, and size comes from it.
- **Materials**: each material with a hatch tracking number from `research/detail/hatches.json`.
- **Increments**: `3`, `3 steps`, `3 inc`. Default 3.
- **Name**, **flags**: as `ai_draft_detail`.

## Validation

Restate the command, including orientation and levels. Ask in one batch: the grade line, the floor levels, the opening tags and sizes, and which materials and hatches apply. Check database access to `viewer_sets` and `viewer_scenes`.

## Scale and text

- Scales from `SK.SCALES`. An elevation is usually `1/8"=1'-0"` for a whole face, or `1/4"=1'-0"` for a part of one.
- Positions in real inches. Level lines are dimensioned from the ground floor level.
- Labels for openings are tags (such as `W-01`), with the schedule outside the drawing.

## Steps

1. **Validate.** Run the Validation section. Wait for answers.
2. **Research** (only with `[research]`). Save in `research/detail/elevation/<name>/`. Look for a published elevation of the same building type.
3. **Read the subject.** Look at `docs/examples/` for elevation and detail patterns. Check every hatch tracking number used against `research/detail/hatches.json`. Flag any opening without a size as a placeholder.
4. **Plan the increments.** Best guess:
   - Increment 1: the outline, grade line, and floor levels.
   - Increment 2: the openings, with tags.
   - Increment 3: materials (hatched by tracking number), notes, and dimensions.
5. **Write the generator** in `tools/generator/elevation.js`, which does not exist yet. It writes one spec per increment to `docs/examples/<name>/`.
6. **Check notes** with `tools/note-blocks.js`.
7. **Draw into the canvas** with `tools/draw-canvas.js`.
8. **Look at the renders.** Check that levels line up, openings sit on their floors, and tags do not overlap.
9. **Track versions** in `viewer_sets` and `viewer_scenes`.
10. **Report** each increment, with placeholder openings and materials.

## Output

- Canvas: each increment is a new canvas detail, tagged `AI` and `draft`.
- Files: specs in `docs/examples/<name>/`. Research and PNGs in `research/detail/elevation/<name>/`.
- Version records in `viewer_sets` and `viewer_scenes`.

## Rules

- Tag every output `AI` and `draft`, with a "Draft: verify before use" note.
- Never claim a level, opening size, or material is correct without a source.
- Cloud writes go only to `viewer_sets` and `viewer_scenes`.

## Open questions for review (best guesses)

- Should openings be read from the schedule automatically, or entered by hand per elevation?
- Is 1/8"=1'-0" the right default for a whole face?
- Do interior elevations need their own skill?
