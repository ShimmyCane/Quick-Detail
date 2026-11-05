# QC: LA Lucas Museum site plan (AI draft)

Checked against the public facts found in the search (One Lucas Plaza, Exposition Park; about 11 acres; Exposition Blvd to the north, Figueroa St to the east). Not checked against a survey or the assessor parcel map.

| Check | Result |
|---|---|
| Boundary closes | Pass. 960 x 500 ft rectangle, closed. Area 480,000 sq ft, about 11.0 acres. Shape is a placeholder. |
| Streets on the right side | Partial. Exposition Blvd north, Figueroa east, Leighton west, south street placeholder. Leighton and the south street are not confirmed. |
| Dimensions match references | Not verified. Only the area and the two street sides come from sources. Everything else is placeholder. |
| North arrow | Pass. Points up (north), with the site drawn north-up. |
| Scale bar matches drawing scale | Pass. Scale bar reads 100 FT; the drawing is 1/4"=1'-0". |
| "(verify)" tags visible | Pass. Visible on the street labels and the title. Leighton St label is partly clipped by the toolbar in the increment 1 render. |
| Notes legible at fit-to-view | Pass. `tools/note-blocks.js`: 54 notes, 0 out of range. |
| Each increment draws | Pass. 10 of 10, `tools/draw-canvas.js`, exit 0. |

## Open items

- Scale: the skill calls for 1/16"=1'-0", but the app has no such scale (`SK.SCALES` in `sketch/units.js`). The drawing uses 1/4"=1'-0", the smallest scale the app has, the same as the Torrance site plan.
- Parcel shape and street names are placeholders. The assessor parcel numbers reported in a 2017 Parks document (5307-027-101 and -102) are not checked against a map.
- Tier 3 (increments 9 and 10): contours, utilities, and survey control points are placeholders. They need a survey.
- Parking counts, setbacks (30 ft), and tree positions are placeholders.
- Export step (DXF or DWG, with layers) is not built. The skill lists this as an open question.
- Version records in `viewer_sets` and `viewer_scenes` are not written. The database check was not run in this session.
