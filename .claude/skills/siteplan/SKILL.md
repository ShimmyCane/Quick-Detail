---
name: siteplan
description: Draft a site plan from an address: extract the address and boundaries, validate them against a map snippet, research and save references, draw the site at scale into the Quick Detail canvas in increments, QC it, and export a CAD/Revit-ready file with an optional map underlay (hidden by default). Use when the user says "siteplan [address or subject] [tier] [increments] [name] [flags]".
---

# siteplan

Status: **best-guess draft, for review.** The generator `tools/generator/siteplan.js` exists as the Torrance draft. The export step does not exist yet.

Shape follows `ai_draft_detail`: understand input, validate the database, plan, draw into the canvas, keep text legible, tie into the increment viewer, draw at scale.

## Input

`siteplan [address or subject] [tier] [increments] [name] [flags]`

- **Address or subject**: a street address, APN, or a named site. The skill extracts the address, the parcel boundary, and the adjacent streets from it.
- **Tier**: how much information to extract and draw. Default `[tier 1]`.
  - `[tier 1]` concept: parcel boundary, streets, building footprints, north arrow.
  - `[tier 2]` schematic: adds setbacks, zoning district, parking and access, easements, trees.
  - `[tier 3]` design development: adds topography (contours), utilities, grading, survey control points.
- **Increments**: `3`, `3 steps`, `3 inc`. Default 3. Each is cumulative.
- **Scale**: default `1/16"=1'-0"` or larger. The extent of the site sets the scale: a small lot can be larger, a block-sized site needs the smallest scale, `1/16"=1'-0"`. Set at validation.
- **Name**: as `ai_draft_detail`. Mark drafts "(AI draft)".
- **Flags**:
  - `[research]`: gather references (see Steps).
  - `[underlay]`: include the map snippet as an underlay. Off by default, so the snippet is hidden in the canvas and in the export.
  - `[no input]`: skip the validation questions and take defaults, stating each one in the report.
  - `[dry run]`: validate and plan only, no drawing or writes.

## Validation

Validation runs first and asks everything in one batch:

1. **Command.** Restate the address, tier, increments, scale, and flags, each marked as given or defaulted. Confirm.
2. **Address and boundary.** Extract the address and boundary from the input. Show a map snippet of the extracted boundary and ask the user to confirm it matches the site. The snippet is a screenshot of the map, and it is what the user checks against.
3. **Clarifications.** Ask in one batch: which streets are real and which are placeholders, whether the boundary is from a survey or a map estimate, and whether the scale should be larger than `1/16"=1'-0"`.
4. **Database.** Check the Architecture project is reachable and `viewer_sets` and `viewer_scenes` exist (cloud rights assumed by default).

Stop at validation until the user confirms. `[no input]` skips the questions but still checks database access.

## Scale and text

- Scales from `SK.SCALES`. Default `1/16"=1'-0"` (factor 16) for a site. A site of several hundred feet fits at this scale.
- Positions are real inches: feet times 12.
- Text is sized so labels read at fit-to-view. Set `text_scale` for the site, for example `{ "title": 24, "note": 24, "small": 16, "dim": 16 }`, and check it in the renders.
- Street labels are 1 to 3 words and sit beside the street, not on it.
- Each note names what it is and states what is still to verify.

## Steps

1. **Validate.** Run the Validation section. Wait for answers.
2. **Research** (with `[research]` or with any tier 2 or 3 request). Gather references: parcel records, zoning map, public plans, and any survey. Save each reference, with its source and date, in `research/detail/siteplan/<name>/references/`. Save a short research note listing what was found and what is still missing.
3. **Extract.** Pull the information the tier needs, from the references and the validated boundary. Each item is one of: found (with source), derived (with method), or placeholder (marked). Nothing is invented.
4. **Plan the increments.** Best guess, cumulative:
   - Increment 1: boundary and streets (the tier 1 base).
   - Increment 2: buildings, parking, and access (tier 2 adds setbacks and easements).
   - Increment 3: trees, contours, utilities, north arrow, and legend.
5. **Draw.** Write the generator in `tools/generator/siteplan.js`, and write one spec per increment to `docs/examples/<name>/`. Run `tools/draw-canvas.js` to draw each increment into the canvas and save a PNG.
6. **Check text.** Run `tools/note-blocks.js` on the specs. Check that labels read at fit-to-view.
7. **QC.** Check the drawing against the validated boundary and the references, not against the render alone:
   - Boundary closes, and every street is on the right side of the parcel.
   - Dimensions match the references, or are marked placeholder.
   - North arrow is correct, and the scale bar matches the drawing scale.
   - Every "(verify)" tag is still visible.
   Record each check and its result in `research/detail/siteplan/<name>/qc.md`.
8. **Export.** Export the final increment to a file that opens in CAD or Revit, with layers: boundary, streets, buildings, parking, trees, labels, and map underlay. The map underlay is a separate layer, hidden by default, and turned on only with `[underlay]`. Save to `research/detail/siteplan/<name>/export/`.
9. **Track versions** in `viewer_sets` and `viewer_scenes`, one set per site, one scene per increment, with the tier in the set's subtitle.
10. **Report** each increment, the QC results, the export path, and the open items.

## Output

- Canvas: each increment is a new canvas detail, tagged `AI` and `draft`.
- Specs in `docs/examples/<name>/`.
- Research, references, QC notes, PNGs, and the export in `research/detail/siteplan/<name>/`.
- Version records in `viewer_sets` and `viewer_scenes`.

## Rules

- Tag every output `AI` and `draft`, with a "Draft: verify before use" note.
- Never claim a boundary, setback, or parking count is correct without a survey or a code check.
- Cloud writes go only to `viewer_sets` and `viewer_scenes`.

## Open questions for review

- "maybe with snip": I read this as a map screenshot for the boundary check. Is that right?
- Export format: DXF (opens in CAD and Revit) or DWG? Should the map underlay be an image layer or a separate file?
- Is `1/16"=1'-0"` right as the default for every site, or should small sites default larger?
