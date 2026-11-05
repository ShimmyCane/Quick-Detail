# QC: LA Lucas Museum site plan (AI draft)

Checked against the public facts from one web search (One Lucas Plaza, Exposition Park; about 11 acres; Exposition Blvd to the north, Figueroa St to the east). The search returned text pages only. No map imagery or existing site plan was pulled. All geometry is placeholder. Not checked against a survey or the assessor parcel map.

| Check | Result |
|---|---|
| Boundary closes | Pass. 960 x 500 ft rectangle, closed. Area 480,000 sq ft, about 11.0 acres. Shape is a placeholder. |
| Streets on the right side | Partial. Exposition Blvd north, Figueroa east, Leighton west, south street placeholder. Leighton and the south street are not confirmed. |
| Dimensions match references | Not verified. Only the area and the two street sides come from sources. Everything else is placeholder. |
| North arrow | Pass. Points up (north), with the site drawn north-up. |
| Scale bar matches drawing scale | Pass. Scale bar reads 100 FT; the drawing is 1/16"=1'-0". |
| "(verify)" tags visible | Pass. Visible on the street labels and the title. Leighton St label sits near the toolbar at the left edge in the increment 1 render. |
| Notes legible at fit-to-view | Pass with minor overlap. `tools/note-blocks.js`: 54 notes, 0 out of range. In increment 10, the site boundary label overlaps the Exposition Blvd label, and the contours label overlaps the legend. Not moved. |
| Each increment draws | Pass. 10 of 10, `tools/draw-canvas.js`, exit 0. |

## Changes made for 1/16"

- Added `1/16"=1'-0"` to `SK.SCALES` in `sketch/units.js`, with factor 192 (real inches per paper inch). The skill's note that 1/16" is factor 16 is wrong; factor 16 is 3/4"=1'-0".
- Note widths scale by 192 / 48 in the generator, because the paper-size text is 4x larger in real inches.
- Note text sizes were reduced (`title` 14, `note` 10, `small` 8, `dim` 8) so labels don't cover the site.

## Open items

- Parcel shape and street names are placeholders. The assessor parcel numbers reported in a 2017 Parks document (5307-027-101 and -102) are not checked against a map.
- Tier 3 (increments 9 and 10): contours, utilities, and survey control points are placeholders. They need a survey.
- Parking counts, setbacks (30 ft), and tree positions are placeholders.
- Export is manual. DXF/DWG is tracked as a to-do in `docs/details-todo.md` under Site plans.
- Version records in `viewer_sets` and `viewer_scenes` are not written. The database check was not run.
