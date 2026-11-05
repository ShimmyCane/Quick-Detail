---
name: ai_draft_elevation
description: Draft an elevation on the canvas with the AI, built as massing first: proportion and scale before detail, from references ranked by confidence, in increments drawn at scale. Triggers a site plan for a complex site and a floor plan for a complex elevation. Use when the user says "ai_draft_elevation [subject] [views] [increments] [name] [flags]".
---

# ai_draft_elevation

Status: **best-guess draft, for review.** No generator exists yet. Shape follows `ai_draft_detail`.

Scope: elevations of a building, one face per view (north, south, east, west, or a named view). Plans, sections, and details are out of scope unless they are triggered below.

## Input

`ai_draft_elevation [subject] [views] [increments] [name] [flags]`

- **Subject**: the building and what it looks like, in words, for example "two-storey clinic, brick base, storefront at ground floor".
- **Views**: which faces to draw, such as `south` or `north, south`. Default one view, the front. If references are given, the views they show are read from them (see Steps).
- **Increments**: `3`, `3 steps`, `3 inc`. Default 3.
- **References**: images, diagrams, or files supplied by the user. Each is checked for which view it shows.
- **Name**, **flags**: `[research]`, `[no input]`, `[dry run]`, as `ai_draft_detail`.

## Validation

Restate the subject, views, increments, and flags, and list the references with the view each one shows. Ask in one batch:

- Which view each reference shows, if it is not clear from the file.
- The floor levels, in feet and inches.
- Whether the site or the floor plan should be drawn first, if the elevation is complex (see Steps).
- Any question from the research step, when `[research]` is on.

Check database access to `viewer_sets` and `viewer_scenes`.

## Scale and text

- Scales from `SK.SCALES`. Default `1/8"=1'-0"` for a whole face.
- Proportion and scale come first. Floor levels, the overall height, and the overall width are right before any opening or material is added.
- Labels are short, and the view name is on the drawing (for example "SOUTH ELEVATION").

## Steps

1. **Validate.** Run the Validation section. Wait for answers.
2. **Reference views.** For each reference, read the view it shows and record it. A reference with no clear view is asked about in validation.
3. **Research** (only with `[research]`). Find images, diagrams, and drawings of similar buildings. Rank each one on confidence (0 to 1) for how well it matches the subject, with one line on why. Save in `research/detail/elevation/<name>/references/`, with a ranking note. If anything is unclear, ask the user before drawing.
4. **Complexity check.** An elevation is complex if it has several roof planes, a setback, or more than three material changes. If it is:
   - Trigger the site plan first, with `ai_draft_siteplan`, to set the site and orientation.
   - Trigger the floor plan, with `ai_draft_floor_plan`, to set the openings and the levels.
   Do not draw the complex elevation until both are confirmed.
5. **Plan the increments (massing first).**
   - Increment 1: the massing. The outline, the floor levels, and the roof line, to scale.
   - Increment 2: the openings, placed by bay, to scale.
   - Increment 3: materials, tags, and accuracy. Element tags are added here, not earlier.
   Later increments may delete and refine earlier shapes, if proportion or scale is off.
6. **Draw.** Write the generator in `tools/generator/elevation.js`, which does not exist yet, and write one spec per increment to `docs/examples/<name>/`. Run `tools/draw-canvas.js` and save a PNG per increment.
7. **Check text.** Run `tools/note-blocks.js`. Check labels at fit-to-view.
8. **QC.** Check proportion against the references (height to width, floor-to-floor), the level lines against the validated levels, and that the view name is on the drawing.
9. **Track versions** in `viewer_sets` and `viewer_scenes`, one set per view, one scene per increment.
10. **Report** each increment, the references used with their confidence scores, and the open items.

## Output

- Canvas: each increment is a new canvas detail, tagged `AI` and `draft`.
- Specs in `docs/examples/<name>/`.
- References, the ranking note, and PNGs in `research/detail/elevation/<name>/`.
- Version records in `viewer_sets` and `viewer_scenes`.

## Rules

- Tag every output `AI` and `draft`, with a "Draft: verify before use" note.
- A reference is a guide to proportion, not a source of dimensions. Never claim an elevation dimension is correct without a source.
- Cloud writes go only to `viewer_sets` and `viewer_scenes`.

## Open questions for review

- What counts as "complex": is the three-material and three-roof-plane threshold right?
- Should the complex-elevation trigger run `ai_draft_siteplan` and `ai_draft_floor_plan` automatically, or ask first?
- Is `1/8"=1'-0"` right for a whole face?

## Cloud library upload

After the increments are drawn and checked, upload the draft to the cloud library as one detail with its increments as a linear history:

```bash
SUPABASE_URL=<Architecture project URL> SUPABASE_SERVICE_KEY=<service role key> \
node tools/library/upload-draft-history.js --specs <docs/examples/<name>> --local-id <ai-name> \
  --name "<Name> (AI draft)" --scale '<scale>' [--renders <render dir>] [--tags "<tags>"] --upload
```

Run it without `--upload` first to check the plan. The tool writes only to `sketch_details` and `sketch_versions`. See `tools/library/upload-draft-history.js`.
