---
name: floor_plan
description: Draft a floor plan on the canvas with the AI, either as a new plan (estimate area, develop program, schematic layout) or as a collaboration on an existing programmatic diagram, through design development. No grids, simple linework, drawn at scale in increments. Use when the user says "floor_plan [subject] [mode] [phase] [increments] [name] [flags]".
---

# floor_plan

Status: **best-guess draft, for review.** No generator exists yet. Shape follows `ai_draft_detail`.

Scope: floor plans through design development. Construction documents are out of scope. Simple linework: no grid lines.

## Input

`floor_plan [subject] [mode] [phase] [increments] [name] [flags]`

- **Subject**: the building or level, in words, for example "two-storey clinic, 12,000 SF, ground floor".
- **Mode**: asked at the start, if not given.
  - `new`: a new plan. Estimate area, develop a program, start with a schematic layout.
  - `collab`: an existing programmatic diagram exists. Identify it and build from it (see Steps).
- **Phase**: how far to take it. Default `[schematic]`.
  - `[programming]` or `[concept]`: program and bubble diagram.
  - `[schematic]` or `[sd]`: rough walls, circulation, room sizes.
  - `[design development]` or `[dd]`: wall types, opening sizes, room finishes referenced, fixtures placed.
- **Flags** for a plan type:
  - `[roof plan]`: draws the roof plan, with slopes and drains, instead of a floor plan.
  - `[reflected ceiling plan]` or `[rcp]`: draws the ceiling plan, with fixtures and soffits.
- **Increments**: `3`, `3 steps`, `3 inc`. Default 3.
- **Name**, **other flags**: `[research]`, `[no input]`, `[dry run]`, as `ai_draft_detail`.

## Validation

Validation runs first and asks everything in one batch:

1. **Command.** Restate the subject, mode, phase, plan type, increments, and flags. Confirm.
2. **Mode.** If the mode is not given, ask: new, or a collaboration on an existing diagram?
3. **Program or source.**
   - For `new`: ask for the program (room list and sizes), or the total SF to estimate from. Estimate the area from the program before layout.
   - For `collab`: identify the source diagram (see Steps) and confirm it.
4. **Clarifications.** Ask in one batch: the building type, number of levels, egress and accessibility assumptions, and the phase's required items (listed below).
5. **Database.** Check the Architecture project is reachable and `viewer_sets` and `viewer_scenes` exist.

Stop at validation until the user confirms. `[no input]` skips the questions and takes defaults.

## Phase requirements

What each phase must contain, before it is marked done:

- **Programming or concept:** room list with target areas, total area estimate, adjacency notes, and a bubble diagram. No walls.
- **Schematic:** room outlines at target sizes, main circulation, entries, exits, and a north arrow. Walls drawn as single lines or simple thick lines.
- **Design development:** walls with thickness by type, door and window openings with sizes, room names and areas, fixtures for wet rooms, and a scale bar. Finish and assembly references are notes, not drawn.

## Scale and text

- Scales from `SK.SCALES`. Default `1/8"=1'-0"` for a whole level. Use `1/4"=1'-0"` for a part of a level.
- Positions in real inches.
- Room names are 1 to 3 words, placed inside the room. Room areas are computed from the drawn outline.
- `text_scale` is set so room names read at fit-to-view.

## Steps

1. **Validate.** Run the Validation section. Wait for answers.
2. **Research** (with `[research]` or a new plan). Gather references: published plans of the same building type, code notes for egress and accessibility, and any client program. Save each reference with its source in `research/detail/floor-plan/<name>/references/`.
3. **Understand the source** (`collab` only). Identify the programmatic diagram. Read it, and state the ask: more programmatic refinement, a schematic, or design development. Confirm with the user before drawing.
4. **Plan the increments.** Cumulative, one phase per increment where it fits:
   - `new`: increment 1 is the program bubble diagram, increment 2 the schematic, increment 3 the design development.
   - `collab`: increments follow the ask, starting from the source diagram.
5. **Draw.** Write the generator in `tools/generator/floor-plan.js`, which does not exist yet, and write one spec per increment to `docs/examples/<name>/`. Run `tools/draw-canvas.js` to draw each increment and save a PNG.
6. **Check text.** Run `tools/note-blocks.js`. Check that room names read at fit-to-view.
7. **QC.** Check the phase's required items are all present. Check that room areas match the program within a stated tolerance, and that the egress and accessibility notes are marked for a code check.
8. **Track versions** in `viewer_sets` and `viewer_scenes`. One set per plan, one scene per increment, with the phase in each scene's label.
9. **Report** each increment, the phase reached, the QC results, and what is still open.

## Output

- Canvas: each increment is a new canvas detail, tagged `AI` and `draft`.
- Specs in `docs/examples/<name>/`.
- Research, references, and QC notes in `research/detail/floor-plan/<name>/`.
- Version records in `viewer_sets` and `viewer_scenes`.

## Rules

- Tag every output `AI` and `draft`, with a "Draft: verify before use" note.
- Never claim egress width, accessibility clearance, or a room area is code-compliant without a check.
- This skill stops at design development. It does not produce construction documents.
- Cloud writes go only to `viewer_sets` and `viewer_scenes`.

## Open questions for review

- For `collab`, what format is the programmatic diagram in: a canvas detail, an image, or a file?
- Should the program estimate use a default SF per room type, and where does that table live?
- Is the default scale `1/8"=1'-0"` right for a whole level?
