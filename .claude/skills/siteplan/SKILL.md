---
name: siteplan
description: Draft a site plan on the canvas with the AI. Boundary, streets, buildings, parking, trees and legend, in real feet and inches, as an architectural background. Works in increments. Use when the user says "siteplan [subject] [increments] [name] [flags]".
---

# siteplan

Status: **best-guess draft, for review.** The generator `tools/generator/siteplan.js` exists (it is the Torrance Cultural Arts Center draft). The rest of this file is a guess to be reviewed.

Adapted from `ai_draft_detail`. Same validation, output, and rules, with site-specific steps.

Scope: site plans only: parcel boundary, streets, building footprints, parking and circulation, trees, north arrow, and legend. Elevations, sections, and details are out of scope.

## Input

`siteplan [subject] [increments] [name] [flags]`

- **Subject**: the site, in words, and its source. Examples: "Torrance Cultural Arts Center, 3 streets, 2 buildings". A site with no address or APN needs one at validation, or the boundary is placeholder only.
- **Increments**: `3`, `3 steps`, `3 inc`. Default 3. Each is cumulative.
- **Name**: as `ai_draft_detail`.
- **Flags**: `[research]`, `[no input]`, `[dry run]`.
- **Site data** (optional, each marked placeholder if missing): parcel APN, boundary in feet, street names and widths, building footprints, parking stall count, tree positions, north bearing.

## Validation

Restate the command. Ask in one batch: is the boundary from a survey or a placeholder, which streets are real, and whether the site needs its own `research/detail/siteplan/<name>/` folder. Check database access to `viewer_sets` and `viewer_scenes`.

## Scale and text

- Scale: `1/4"=1'-0"` (factor 48) from `SK.SCALES`. A site of several hundred feet fits only at this scale.
- Positions in real inches: feet times 12.
- `text_scale` for a site: `{ "title": 24, "note": 24, "small": 16, "dim": 16 }`, so labels read at fit-to-view.

## Steps

1. **Validate.** Run the Validation section. Wait for answers.
2. **Research** (only with `[research]`). Search for the parcel, zoning, and any survey or public plan. Save in `research/detail/siteplan/<name>/`. Flag what needs a survey before it can be trusted, such as the boundary, setbacks, and easements.
3. **Read the subject.** Look at `docs/examples/torrance-cac/` for the site pattern. Check the streets and buildings against the research. Every street is labelled "(verify)" unless confirmed.
4. **Plan the increments.** Best guess, matching the Torrance draft:
   - Increment 1: streets and boundary.
   - Increment 2: buildings, curbs, parking.
   - Increment 3: trees, north arrow, legend.
5. **Write the generator** in `tools/generator/siteplan.js`. Copy the pattern there. Output specs go to `docs/examples/<name>/`.
6. **Check notes** with `tools/note-blocks.js`.
7. **Draw into the canvas** with `tools/draw-canvas.js`, one PNG per increment.
8. **Look at the renders.** Check orientation (north up), that street labels read, and that the "(verify)" tags are visible.
9. **Track versions** in `viewer_sets` and `viewer_scenes`, one set per site.
10. **Report** each increment, with the open survey items.

## Output

- Canvas: each increment is a new canvas detail, tagged `AI` and `draft`.
- Files: specs in `docs/examples/<name>/`. Research and PNGs in `research/detail/siteplan/<name>/`.
- Version records in `viewer_sets` and `viewer_scenes`.

## Rules

- Tag every output `AI` and `draft`, with a "Draft: verify before use" note.
- Never claim a boundary, setback, or parking count is correct without a survey or code check.
- Cloud writes go only to `viewer_sets` and `viewer_scenes`.

## Open questions for review (best guesses)

- Should site research go under `research/detail/siteplan/`, or a separate `research/site/`?
- Is 1/4"=1'-0" the right default, or should a site plan use a larger-scale sheet?
- Should a site plan always have three increments?
