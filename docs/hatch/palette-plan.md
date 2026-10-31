# Basic palette: description and plan

Status: **draft for review.** Numbers P-01 to P-15 follow the proposed basic palette in `docs/hatch-reference.md` section 8. Numbers B-01 to B-05 are the brick options in `docs/hatch/review/brick-options.png`. Draw values are proposals in paper inches, tuned at review. Nothing here changes `sketch/hatch.js` yet.

Scale: 3"=1'-0" (factor 4). Spacing is in paper inches, so the same value looks the same at any scale.

Cloud draft for review: `sketch_details`, local_id `ai-hatch-starting-point` (tags AI, draft, hatch, review). It shows the starting point sheet as the app will draw it.

---

## How to read the table

- **Key**: the name in `sketch/hatch.js`. **New** means the key does not exist yet.
- **Draws today**: what the current code produces.
- **What the reader sees**: the plain description, written so a reviewer can check it against the sheet.
- **Plan**: the change needed and its next step.

---

## The palette

| # | Material | Key | Status | Draws today | What the reader sees | Plan |
|---|---|---|---|---|---|---|
| P-01 | Steel | `steel` | exists, **change agreed** | Solid fill | Two diagonal lines, closely paired, at -45 degrees. Decided 10/31. | Add a `pair` kind: two lines, 0.05 paper in apart, repeating every 0.26. Keep a separate solid key (see P-16). |
| P-02 | Concrete | `concrete` | exists | Stipple dots, spacing 0.14 | Sparse dots. Reference also has small open triangles. | Add optional triangles, or a `concrete-agg` key. Decide at review. |
| P-03 | Sand / fill | `sand` | **new** | `screen` is used today, and it is much denser than the reference | Sparse small dots on white, lighter than concrete. | Dots at spacing about 0.20, radius 0.008. Compare with the reference at review. |
| P-04 | Gravel | `gravel` | exists | Larger dots, spacing 0.24, radius 0.02 | Coarse dots, spaced apart. | Check against the CAD gravel sheets. No change expected. |
| P-05 | Earth | `earth` | exists | 30 degree crosshatch | Crosshatch, not stipple. Reference shows stipple with angled bands. | Decide crosshatch or stipple at review. Either keeps the key. |
| P-06 | Brick, diagonal | `brick` | exists, **under review** | Lines run down to the right (B-01) | Lines run up to the right (B-02, recommended). | Change the angle sign once B-02 is confirmed. Check existing examples that use `brick` first. |
| P-07 | Brick, running bond | `brick-bond` | **new** | Nothing. The starting point borrows `cmu` | Brick-sized courses, each offset by half a block. | Course height 0.22, block length 0.44 paper in, as a first try. Same family as `cmu`, with its own name. |
| P-08 | Concrete block | `block` | **new** | Nothing. The starting point leaves it empty | Diagonal crosshatch forming diamonds, at about plus and minus 45 degrees. | Two families, plus and minus 45, spacing 0.30. Distinct from `rigid`, which is insulation. |
| P-09 | Wood, along grain | `wood1` | exists | Lines along the grain, spacing 0.16 | Parallel lines along the member. | None. |
| P-10 | Wood, across grain | `wood2` | exists, **decide** | 45 degree lines | Options: end-grain rings, or the current lines. | Decide at review. Rings would be a new `rings` kind. |
| P-11 | Plywood | `plywood` | exists | Square grid, 0 and 90 degrees | Grid. Reference shows a herringbone or chevron. | Decide at review whether herringbone is wanted. |
| P-12 | Insulation, batt | `batt` | exists | Wavy rows | Loose wavy lines in rows. | None. |
| P-13 | Insulation, rigid | `rigid` | exists | Fine crosshatch, plus and minus 45 degrees | Fine crosshatch, closer than `block`. | None. Keep it distinct from `block`. |
| P-14 | Gypsum | `gypsum` | exists, **no source** | 45 degree lines | Single diagonal lines. No reference sheet shows gypsum. | Keep or drop. If kept, source it first. |
| P-15 | Glass | `glass` | **new** | Nothing | Short diagonal dashes inside the boundary. | New `dash` kind: dashes 0.10 long, spaced 0.30, at 45 degrees. |
| P-16 | Solid fill | `solid` | **new**, proposed | Only `steel` is solid | A plain solid grey fill. The classic sheet lists a solid hatch. | Add `solid` so the classic entry has its own key. Steel is then two lines (P-01). |

---

## Counts

- Exist today and can be drawn as they are: P-02, P-04, P-05, P-09, P-11, P-12, P-13, P-14 (eight), plus P-06 once its angle is decided.
- Change agreed: P-01 (steel).
- New keys: P-03, P-07, P-08, P-15, P-16.
- Decisions still open: P-02, P-05, P-06, P-10, P-11, P-14.

---

## Plan, in order

1. **Decide the open points** above. Reply at review with the decision number, for example "P-06: adopt B-02".
2. **Add the missing kinds** to `sketch/hatch.js`: `pair` (P-01), `dash` (P-15), and any `rings` (P-10) if chosen. Each kind gets a test in `tests/hatch.js`.
3. **Add the new keys**: `sand`, `brick-bond`, `block`, `glass`, `solid`. Each one cites its catalogue entry (`docs/hatch/catalogue.json`).
4. **Redraw the starting point** with the final keys, then check it: `SK.authorDetail` builds, `SK.hatchPrims` returns a fill for every key, `node tests/hatch.js` passes, and the sheet is rendered and looked at.
5. **Review the render** against this table. Any mismatch goes back to the reference doc, not to a silent change.
6. **Commit** only when you ask. Then update the reference doc.

---

## Rules that apply to every key

- Each key is our own design, controlled and edited beyond the reference. A reference shapes the look and the convention, never the exact drawing.
- Each key says in its note what material it stands for. A hatch alone is not a specification.
- Numbers P-xx and B-xx are used in notes, PRs and review comments so every decision can be tracked.
