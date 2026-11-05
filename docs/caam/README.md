# California African American Museum (CAAM), Exposition Park, LA: plans, elevations, isometric (AI draft)

An AI draft of the CAAM building, drawn in 10 iterations from public sources and recorded as a Quick Detail lane tree, so the edit-history viewer replays each iteration line by line. The action log, troubleshooting included, is in [`LOG.md`](LOG.md).

**Open `caam-history.html`** in any browser. This is the viewer as one exported file, with the history inside. The same 10 iterations are also in the Increment Viewer repo as `viewer.html?set=caam`.

The footprint is traced from OpenStreetMap. Every height, use and detail is an assumption read from public photos. It is **not surveyed**. Check it against the State of California's drawings before using it.

## The tree

| Lane | Step | Iteration | View |
|---|---|---|---|
| 0 | 1 | 1 | Site, traced from OSM (drawn at 1/4 of the sheet scale) |
| 0 | 2 | 2 | Traced footprint and ground shell |
| 0 | 3 | 3 | Ground floor program, with traced areas |
| 0 | 4 | 4 | Roof plan and section line A |
| 0 | 5 | 5 | Plaza elevation, first pass (massing) |
| 0 | 6 | 6 | Plaza elevation, second pass (curtain walls, block, drum, steps) |
| 0 | 7 | 7 | East elevation on Figueroa Street, and section A |
| 0.6 | 1 | 8 | Branch from 6: plaza elevation, option B, the later refresh |
| 0.7 | 1 | 9 | Branch from 7: isometric massing from the north-west (the chosen view) |
| 0.7 | 2 | 10 | Isometric, detailed (final) |

**Why the north-west isometric.** The plaza face is the most worked-out view (two passes and an option), and it is the public face in every photo. Seen from the north-west, the 45° face reads square-on, with the court roof, the tower and the Figueroa offices rising behind it.

The sheet scale is 1/4"=1'-0". Each iteration's spec is in `docs/examples/caam/`, tagged `AI`, `draft` and `ai_inferred`. Iterations 1 to 7 are also one spec, `2d-sheet-iterations-1-to-7.json`. Rebuild with `node tools/caam.js`, then `node tools/caam-render.js`.

## How the 3-D views are drawn

The plaza elevation, the east elevation and the isometric all come from one block model in `tools/caam.js`. The model is a partition of the traced footprint into prisms, plus the tower, the steps and the drum. Each visible face is drawn as a solid tone (a `steel` solid hatch in a hex pen), far to near (a painter's algorithm), so nearer faces hide farther ones. The tone follows the face's direction to a light from the north-west. Only the decoration differs between passes: curtain walls, block coursing, columns and court glazing.

## Review passes

Renders: `review/iter-NN.png` and `review/sheet-all.png` are the final pass. `review/pass-0/` is the first build, and `review/pass-1/` holds contact sheets of the second.

- **Pass 0 to 1.**
  - The titles of iterations 5 and 6, and of 9 and 10, sat in the same place. They are now stacked.
  - Iteration 8's callouts were placed on the plaza elevation's baseline and crossed the whole sheet. They now follow their own view.
  - The court walls took the glass tone, and faces turned from the light were too dark.
  - The street line cluttered the isometric.
  - Text was raised 1.5× (titles 9×, callouts 6×, labels and dimensions 5×), because this building is larger than Rand Hall (lesson 13).
- **Pass 1 to 2.**
  - Note widths are now fitted to the text, so they read as blocks. Before, 36 of 57 notes were out of range; now none are (`tools/note-blocks.js --strict`). Four notes where the estimate wraps differently from the page take the checker's measured width.
  - The plaza callouts are set in two staggered rows.
  - The east elevation's level marks were on the wrong end: the view's axis is Y, and the call passed X first.

## What the sources say

- Chartered by the State of California in 1977. It opened in 1981 in temporary space and moved to this building in 1984 (Wikipedia).
- Designed by the African American architects Jack Haywood and Vince Proby. It cost about $5 million and opened during the July 1984 Olympic Games. It was renovated in 2001–03 (Wikipedia).
- 44,000 sq ft: three exhibition galleries, a theater gallery, a **14,000 sq ft sculpture court**, a conference and special events room, and an archive and research library. Administration, exhibit design and storage are behind the scenes (Wikipedia).
- It sits in the south-east of Exposition Park. State Drive is to the north, South Figueroa Street to the east, and the Samuel Oschin Air and Space Center to the west. A pedestrian plaza from the Science Center meets the museum along a 45° face (OpenStreetMap).
- The traced footprint is **46,406 sq ft**, against 44,000 sq ft published. That is 5 % over, within tracing error at about 0.8 ft a pixel. So the building is mostly one storey.
- Photos: there are split-face block walls and a stepped tower behind a half-round entry canopy on round columns. Curtain walls of dark mullions sit between block piers, with bleacher steps in front. A sloped metal and glass roof shows behind (p1, p5). The later refresh has a white canopy with "CAAM" lettering, darker block, a white colonnade with a sign beam, and white-painted block with a sunburst graphic (p4, p5, p7).

## Assumptions (open)

1. **The sculpture court** is the zone behind the 45° face, east of the lobby (about 12,800 sq ft of the published 14,000). Its glazed roof rises from +26 ft at the plaza to +42 ft at the back. This is inferred from the sloped roof in p5 and from how well the triangle's area fits. *Weakest: interior photos would settle it.*
2. Galleries and parapets are at +26 ft, the theater gallery at +24 ft and the west pavilion at +18 ft. These are scaled from people and doors in p1 and p5.
3. The library, offices and conference room run in the strip along Figueroa at +32 ft. That strip is narrow and stepped in the trace. *There is no photo of the Figueroa side,* so its walls and slot windows are invented.
4. The stepped tower has three tiers (+34, +40, +46 ft) over the lobby, behind the drum. p1 confirms the stepped profile, but not the plan size.
5. The entry drum has a 20 ft radius, a fascia from +15 to +19 ft and four round columns 2'-6" across. The trace shows the drum, and the photos show three or four columns.
6. The rooms are placed from the published list. The placement is not confirmed.
7. Walls are 16 in split-face block. The court roof is a 4 ft space frame. Gallery roofs are a deck on joists.
8. Option B's dates are not confirmed. The white colonnade (p4, p7) has no confirmed place. The OSM garden path from the south lot suggests the south-west side.

## References and what could not be reached

- **Map:** OpenStreetMap tiles at z19 (`refs/osm-z19-exposition-park.png`, © OpenStreetMap contributors, ODbL). The footprint was traced from them, because the **Overpass API** dropped every connection through the proxy (4 tries with backoff). Overpass would have given the exact vertex list.
- **Photos:** Wikimedia Commons, [Category: California African American Museum](https://commons.wikimedia.org/wiki/Category:California_African_American_Museum). They are kept in the session scratchpad and not committed.
  - p1 [At USC – panoramio.jpg](https://commons.wikimedia.org/wiki/File:At_USC_-_panoramio.jpg)
  - p4 [California African American Museum exterior.jpg](https://commons.wikimedia.org/wiki/File:California_African_American_Museum_exterior.jpg)
  - p5 [California African American Museum front entry.jpg](https://commons.wikimedia.org/wiki/File:California_African_American_Museum_front_entry.jpg)
  - p7 [California African American Museum.jpg](https://commons.wikimedia.org/wiki/File:California_African_American_Museum.jpg), CC BY-SA 4.0, Brian Forrest, July 2017

  The other licences were not read, because the Commons API rate-limited this session. Two more photos (the entrance and the 2015 exterior) returned errors.
- **Text:** [Wikipedia: California African American Museum](https://en.wikipedia.org/wiki/California_African_American_Museum).
- **Not reached:** caamuseum.org, news archives and the State's drawings. This environment does not allow those hosts, and the user asked for no further input, so no network change was requested. They would settle the heights, the court and the room layout.
