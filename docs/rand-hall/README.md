# Rand Hall, Cornell, c. 2005: plans, elevations, isometric (AI draft)

An AI draft of Rand Hall as it stood in the 2000s, when it held Cornell's architecture studios. It was drawn in 10 iterations and recorded as a Quick Detail lane tree, so the edit-history viewer replays each iteration line by line.

**Open `rand-hall-history.html`** in any browser. This is the viewer as one exported file, with the history inside. Press **▶ Play** on a scene card to watch it drawn, or **GIF** on a lane to export the whole line.

Every dimension is an assumption built from the published facts below. It is **not surveyed**. Check it against Cornell's archive drawings and photographs before using it.

## The tree

| Lane | Step | Iteration | View |
|---|---|---|---|
| 0 | 1 | 1 | Site and footprint (drawn at 1/4 of the sheet scale) |
| 0 | 2 | 2 | Structural grid and first floor plan |
| 0 | 3 | 3 | Third floor, architecture studios |
| 0 | 4 | 4 | Roof plan: sawtooth, section line A |
| 0 | 5 | 5 | South elevation, first pass (massing) |
| 0 | 6 | 6 | South elevation, second pass (piers, stone, sash) |
| 0 | 7 | 7 | East elevation and cross section A |
| 0.6 | 1 | 8 | Branch from 6: north elevation, option B sash |
| 0.7 | 1 | 9 | Branch from 7: isometric massing from the southeast (the chosen view) |
| 0.7 | 2 | 10 | Isometric, detailed (final) |

The sheet scale is 1/4"=1'-0". Each iteration's spec is in `docs/examples/rand-hall/` and is tagged `AI`, `draft` and `ai_inferred`. Review renders are in `review/`.

Rebuild with `node tools/rand-hall.js`, then `node tools/rand-hall-render.js`.

## Text visibility passes

The first build used paper-size text, which cannot be read at 1/4"=1'-0" on a 200 ft building. Two passes fixed it for the 2-D sketches (iterations 1–8). The renders of each are kept in `review/text-pass-0` (before), `review/text-pass-1` and `review/text-pass-2`.

1. **Pass 1, a text hierarchy.** Titles are 6× the paper text size, callouts 4×, and small labels (levels, grid bubbles, section and north letters) 3.5×. Dimensions are 3.5×. Note widths grow with their class. Plans and elevations are spaced further apart to make room for the larger titles.
2. **Pass 2, the overlaps that pass 1 showed.** The site callouts are narrower and sit clear of the plan and East Avenue. The south elevation callouts are set in one row above the parapet. The Grade level label drops below its line. The plan's entry and east-stair notes are moved off the walls. The section moves right, so its titles and the pier note no longer meet the east elevation.

## What the sources say

- Built in 1911 to designs by Gibb & Waltz, in a Neo-Classical style. Gross area 32,915 sq ft, net 26,976 sq ft (Cornell Facilities).
- Three stories of yellow brick, with pilasters and bands of light stone. A steel-and-masonry "daylight factory" with a grid of large steel casement windows (Wikipedia; Architectural Record).
- It sits at the north-east corner of the Arts Quad, behind Sibley Hall, on University Avenue, with the Foundry to the west. Milstein Hall (OMA, 2011) was later built in the gap between them.
- Its first use was Sibley College's machine shop, pattern shop and electrical laboratory. It held the architecture studios until the move to Milstein.
- About 43 ft above grade before the 2017–19 renovation (Ochshorn). The renovation removed the third floor and roof, raised the roof above the old sawtooth, and put in 20 new beams spanning 50 ft from the north wall to the south wall. The east stair was removed (Architectural Record; Ochshorn; Ithacating).

## Assumptions (open)

1. The footprint is 200 × 52 ft. This fits the 50 ft span plus the walls, and the gross area over three floors.
2. There are 10 bays of 20 ft on the long sides, inferred from the 20 new beams at two to a bay. The piers are 2'-6", widening to 4 ft at the corners.
3. One line of steel columns runs down the middle (grid B). Floors are concrete slabs on steel beams.
4. Floor levels are +1'-6", +15'-6" and +28'-6". The roof bears at +40 ft and the parapet top is at +43 ft.
5. The sawtooth has four teeth, with ridges running east–west, glass facing north and a 6 ft rise. The sources confirm a sawtooth, but not its count, pitch or direction.
6. The sash has three units an opening (south elevation) or two (north elevation, option B). The pane counts are not confirmed.
7. There are entries in the south bay of each end wall and stairs in the north bays at both ends.
8. Uses: shops and review space on the first floor, studios on the second and third floors.

## Sources

- [Rand Hall, Wikipedia](https://en.wikipedia.org/wiki/Rand_Hall)
- [Cornell Facilities: Rand Hall (2017)](https://www.fs.cornell.edu/fs/facinfo/fs_facilInfo.cfm?facil_cd=2017)
- [Architectural Record: Mui Ho Fine Arts Library](https://www.architecturalrecord.com/articles/14331-mui-ho-fine-arts-library-at-cornell-university-by-stv-and-wolfgang-tschapeller)
- [Jonathan Ochshorn: building code violations in the Fine Arts Library](https://jonochshorn.com/scholarship/writings/rand-title-19-complaint-2019/index.html)
- [Jonathan Ochshorn: critique of the Rand Hall Fine Arts Library proposal](https://jonochshorn.com/scholarship/writings/rand-FAL-critique.html)
- [The Architect's Newspaper: Tschapeller's Cornell library](https://www.archpaper.com/2019/11/wolfgang-tschapeller-cornell-library/)
- [Ithacating: Rand Hall construction update, 12/2018](https://ithacating.com/2018/12/22/cornell-fine-arts-library-rand-hall-construction-update-12-2018/)
- [Edward Tremel: Architecture at Cornell](https://www.cs.cornell.edu/~edward/architecture.html)
