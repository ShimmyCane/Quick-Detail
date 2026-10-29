# Earth hatch

How we define the Earth hatch, what the user draws by hand, and why we settled on the grouped version. Facts carry a source. Anything without one is marked `assumed`.

## 1. App definition

- `sketch/hatch.js:32`: key `earth`, label "Earth", two line families at ±30° with 0.25 in spacing (paper inches). This is the only earth definition in the app.
- The header comment in `sketch/hatch.js` cites architectural symbol references for the material set in general. It gives no source for earth in particular, so the ±30° lines are `assumed`.
- Both families are continuous lines. The hatch can't show the dash-and-group look the user draws.

## 2. Hand-drawn convention (the user's sketch)

Source: Supabase detail `Hatch Collab 2` (`local_id` dmvu4dq0m1cl0), read 2026-10-29.

- Outline: a hand-drawn closed shape about x 18.5 to 23.9 and y 4.3 to 8.1 (about 5.4 in × 3.7 in), line weight 0.08.
- Inside it: 48 short hairline dashes at weight 0.04. Each dash is about 1.0 in long.
- Orientation: mostly horizontal (within about ±9°) and vertical (within about ±5° of 90°). No diagonals.
- Rows: horizontal dashes sit on rows about 0.3 in apart, staggered from row to row.
- Columns: vertical dashes sit in loose columns with similar spacing.
- The user also wrote "Better earth" next to it, at about x 25.2, y 4.4. This is the only written note on the pattern.
- Not drawn: the diagonal ±30° lines the app uses. The user's version is orthogonal.

## 3. Versions we drew and what the user chose

All drawn in the cloud detail `Hatch Collab`, below the sketch. Coordinates are from the same outline, moved down the page.

| Run | Versions | Chosen | Note |
|---|---|---|---|
| 3 | One app `earth` hatch swatch (±30°), wrong for the sketch | Rejected | Drew the app hatch, not the sketch. |
| 3 | Straight traced copy of the 48 dashes | Accepted as the base | Matches the sketch but is rough. |
| 4 | A: sketch cells, one dash per cell. B: brick rows of horizontal dashes. C: checker of paired lines | C | A read sparse. B was even but lost the mix of orientations. C kept the mix. |
| 5 | C1: groups of 5, 0.18 in spacing, 0.9 in long, 4×3 checker. C2: 0.10 in spacing, lengths vary, 6×4. C3: 0.22 in spacing, 2×2 super-cells | C1, then C3 | The user asked for five lines in each group. |
| 6 | C1A to C1F: spacing, length, margin, stagger and length variation on C1 | Not yet judged | See section 5. |

## 4. Decision: the grouped checker (C1)

- Groups of five parallel lines, spacing 0.18 in, length 0.9 in.
- A 4 × 3 grid of cells, each about 1.35 in wide and 1.17 in tall, inside the 5.4 × 3.5 in outline.
- Checker: each cell holds either a horizontal group or a vertical group, alternating, with the top-left cell horizontal.
- Every line stays at least 0.2 in inside the outline.

Rationale:
- The user's sketch is orthogonal and rough. A grid keeps the orientation mix and removes the wobble.
- Five-line groups read as a texture at drawing scale, where single dashes read as stray marks and pairs read as sparse.
- The checker keeps the horizontal and vertical mix from the sketch, which the user kept asking for.
- The 0.2 in margin keeps the marks clear of the outline. The app's own fill margin is much smaller (`SK.HATCH_MARGIN_PAPER`, 1/32 in), so this margin is a choice for this pattern, not a rule from the app.

Not a code rule. The pattern is a drawing convention for this user's markup. Nothing here says it matches a listed assembly.

## 5. Open questions

- Judge C1A to C1F (run 6). Record the choice here with the reason.
- Should the chosen grouped pattern become an app hatch key? Today the app only knows the ±30° lines. Drawing the groups as strokes works for markup, but a key would let the app redraw it at any scale.
- Is the user's "Better earth" note asking for a specific look that none of the versions gives?
- The app's ±30° `earth` definition has no source. Find one or leave it marked `assumed`.

## 6. Chosen description (plain words)

Chosen by the user on 2026-10-29 as "earth hatch v2", after C1B2 and C1B11 were tried. Written as a rule, not code.

- Inside the outline, place a grid of square cells, six across and four down, on one equal pitch of 0.9 in both ways.
- Each cell holds one group of five parallel lines, spaced 0.2 in apart.
- Cells alternate: horizontal group, then vertical group, like a checkerboard. The first cell in the top-left is horizontal.
- Every line is the same length, 0.8 in, and the same weight, 0.04 in.
- Keep every line at least 0.05 in inside the outline.
- At a distance it reads as an even grey tone with almost no white. Up close, each group reads as a set of parallel marks, and the checker keeps the horizontal and vertical marks visibly different.
- Reference: a general earth or ground convention of short, random-looking marks, rendered here as a regular checker so it tiles without white seams.
