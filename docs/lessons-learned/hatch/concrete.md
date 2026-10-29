# Concrete hatch

Plain-words description of concrete as the user draws it, what common practice says, and the options. Written as rules and negatives, not code.

## 1. What the user drew (section cut, upper left of "Hatch Collab 2")

- A slab about 6.5 in wide, between a top line near y -0.8 and a bottom line near y 3.2, with side walls at about x -2.1 and x 4.3.
- Inside: a sparse scatter of single dots, about 8 of them, and about 6 small closed loops, each roughly 0.3 to 0.6 in across. The loops read as aggregate stones.
- Not drawn: a solid grey fill, a regular grid of dots, and any diagonal lines.
- Density: low. The white ground shows between the marks, and the marks do not repeat in a grid.

## 2. What common practice says (checked 2026-10-29)

- Concrete in a section cut is usually a scatter of dots and small triangles that stand for aggregate. Cast-in-place concrete gets a random dot stipple. Precast is often dots with light diagonal lines.
- These are shared conventions, not a formal rule, and they vary by region and by office. Drawing sets often add a legend for anything that is not obvious.
- Scale matters. At large scales, show the aggregate. At small scales, switch to a plain grey fill, because the dots pack together and stop reading as separate marks.
- In AutoCAD the usual concrete pattern is AR-CONC, a triangle-and-dots pattern. Its spacing is fixed on paper, so it turns grey at small scales.
- Sources: learnarchitecture.net, "39298 architectural hatch patterns" (https://learnarchitecture.net/articles/39298-architectural-hatch-patterns.html); Studio Matrx, "Material hatching patterns" (https://www.studiomatrx.org/students/drawing-fundamentals/material-hatching-patterns); AutoCAD forum thread on the triangle-and-dots pattern (https://forums.augi.com/archive/index.php/t-7849.html).

## 3. Why the app's concrete looks wrong

- `sketch/hatch.js` gives concrete a regular stipple, a dot about every 0.14 in. That is closer to a grey fill than to the sparse aggregate the user draws, and it has no stones. This is a likely reason the concrete reads wrong.

## 4. Options (pick one)

Each option is drawn above the slab in the cloud sheet, at x -2.0 to 4.4, stacked from y -5.0 downward. The drawing is placed by rule, not by hand.

- **A. Sparse stipple.** Dots only, on a loose grid about 0.45 in apart, about one in four kept, each nudged at random within 0.15 in.
  - Not: a regular grid, a solid fill, or stones with outlines.
  - Reads at a distance as a light tone. Close up, separate dots.
- **B. Stipple with aggregate.** Dots on a 0.6 in grid, about one in three kept, plus small hollow triangles, about one in six cells, 0.14 in across.
  - Not: filled triangles, or triangles in every cell.
  - Closest to the common triangle-and-dots convention and to the user's sketch.
- **C. Dense stipple.** Dots on a 0.22 in grid, about one in three kept.
  - Not: a grey fill. The dots must still show separately at this scale.
  - Reads as a mid-grey tone at a distance, and matches the app's current concrete more closely.
