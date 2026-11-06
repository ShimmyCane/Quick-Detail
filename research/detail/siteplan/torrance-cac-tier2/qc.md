# Torrance Cultural Arts Center, site plan, tier 2 (AI draft): QC

Scale 1/16"=1'-0". Generator: tools/generator/siteplan-torrance-t2.js. Specs: docs/examples/torrance-cac-tier2/.

## Sources
- OpenStreetMap raster tiles, z17, centred 33.8392 N, 118.3439 W (coordinates from one third-party page, not verified against an official source). Used for street layout and footprints by eye. Saved as references/siteplan_context_osm_z17.png. Attribution: (c) OpenStreetMap contributors, ODbL.
- Not reached: Google Maps Static API (no key in session, 403), Overpass and Nominatim (no response), City of Torrance and county sources (no response). Zoning, setbacks, easements, survey and utilities are NOT in this draft.

## Checks
| Check | Result |
|---|---|
| Street layout matches the OSM tile | Pass by eye. Civic Center Dr north, Torrance Blvd south, Madrona Ave west, Maple Ave east. The earlier torrance-cac draft had the wrong streets (Crenshaw east, Torrance Blvd north); it is superseded by this draft. |
| Boundary | Map estimate only. Campus block, not surveyed. Marked "CAMPUS BOUNDARY, ESTIMATE". |
| Building footprints | Placeholders, placed by eye from the tile. Not measured. |
| Parking stalls | Placeholder striping, 9 ft x 18 ft. Stall counts not verified against any parking plan. |
| Trees | Approximate canopy, placed by eye. Not surveyed. |
| Text (tools/note-blocks.js) | 7 notes checked, 0 out of range. |
| Render (tools/draw-canvas.js) | All three increments drawn. Labels checked in the increment 3 render; overlaps fixed. |
| North arrow and scale bar | Present. Scale bar 200 ft. |

## Open items
- Verify the boundary against the APN or a survey before any use.
- Obtain zoning and setbacks from the City of Torrance (not reachable here).
- Export (DXF) and Supabase upload not done: no export tool exists yet, and no service key is in the session.
