---
name: schedule
description: Draft a schedule on the canvas with the AI: a table of doors, windows, finishes, hatches or similar items, with their tracking numbers, drawn on a sheet. Works in increments, each one a new canvas detail. Use when the user says "schedule [subject] [increments] [name] [flags]".
---

# schedule

Status: **best-guess draft, for review.** No generator exists yet. The shape below is a guess, to be reviewed before anything is built.

Adapted from `ai_draft_detail`. Same validation, output, and rules, with schedule-specific steps.

Scope: tables drawn on a sheet. Schedules of doors, windows, finishes, hatches, and similar items. Drawings of the items themselves are out of scope.

## Input

`schedule [subject] [increments] [name] [flags]`

- **Subject**: the kind of schedule, in words, for example "door schedule for Level 1" or "hatch schedule".
- **Columns**: the column names and order. Defaults for each kind are below.
- **Rows**: the items. Each row is one item, with its tag or tracking number.
- **Source**: where the rows come from. Hatches come from `research/detail/hatches.json`. Doors and windows come from the tags used on floor plans and elevations.
- **Increments**: `3`, `3 steps`, `3 inc`. Default 1 (a schedule is usually one table, drawn in parts).
- **Name**, **flags**: as `ai_draft_detail`.

Default columns, to be confirmed:
- **Door**: tag, size (width by height), type, material, fire rating, hardware set, notes.
- **Window**: tag, size, type, glazing, frame, notes.
- **Finish**: room, floor, base, walls, ceiling, notes.
- **Hatch**: tracking number, hatch name, material description, used on.

## Validation

Restate the command, including the kind and the columns. Ask in one batch: which columns are needed, whether rows should come from the registry or be typed in, and whether the schedule should be split across sheets. Check database access to `viewer_sets` and `viewer_scenes`.

## Scale and text

- A schedule is not drawn to scale. Use a text size that reads at fit-to-view, and set `text_scale` for the table.
- Table cells are lines and notes. Column widths are real inches, and each row has the same height.
- Keep notes within the cell. Use `note_text_blocks` for any cell longer than a label.

## Steps

1. **Validate.** Run the Validation section. Wait for answers.
2. **Research** (only with `[research]`). Save in `research/detail/schedule/<name>/`. Look for a published schedule of the same kind.
3. **Read the subject.** Check the rows against their source. For hatches, every tracking number must exist in `research/detail/hatches.json`. For doors and windows, every tag must appear on a plan or elevation. A row with no source is not written: report it.
4. **Plan the increments.** Best guess:
   - Increment 1: the header and the first rows.
   - Increment 2: the remaining rows.
   - Increment 3: notes, totals, and a legend.
5. **Write the generator** in `tools/generator/schedule.js`, which does not exist yet. It writes one spec per increment to `docs/examples/<name>/`.
6. **Check notes** with `tools/note-blocks.js`.
7. **Draw into the canvas** with `tools/draw-canvas.js`.
8. **Look at the renders.** Check that every row is complete, that columns align, and that no text is cut off.
9. **Track versions** in `viewer_sets` and `viewer_scenes`.
10. **Report** each increment, with any row left out and why.

## Output

- Canvas: each increment is a new canvas detail, tagged `AI` and `draft`.
- Files: specs in `docs/examples/<name>/`. Research and PNGs in `research/detail/schedule/<name>/`.
- Version records in `viewer_sets` and `viewer_scenes`.

## Rules

- Tag every output `AI` and `draft`, with a "Draft: verify before use" note.
- Never invent a row, size, rating, or hardware set. A missing value is left blank and listed.
- Cloud writes go only to `viewer_sets` and `viewer_scenes`.

## Open questions for review (best guesses)

- Should the hatch schedule be built from `research/detail/hatches.json` automatically?
- Should door and window schedules be generated from the floor plan tags, or typed in?
- Are the default columns right for each kind?
