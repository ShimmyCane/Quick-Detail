# Hatch reference

The shared reference for hatch patterns: what a hatch is, how this app draws one, which reference sheets we have, and which conventions are agreed. Future batches of hatches are added here once agreed.

Status: **draft for agreement.** Items marked **Agreed** are shared truth. Items marked **Proposed** or **Open** need a decision before a batch is built. Lessons from each session go in `docs/lessons-learned_hatch.md`.

---

## 1. What a hatch is

A hatch fills a cut or closed region with a pattern that names the material. In a section, the reader sees what is cut without reading the note. A hatch is a drawing convention. It does not specify a material, a grade or a code requirement. A note beside the hatch always names the material too.

**Agreed:**
- Hatch the cut material in sections. Do not hatch elevations or plan views unless a batch says so.
- Hatch lines are fine weight, so the outline and the dimensions read first.
- Every hatch has a closed boundary. An open shape gets no fill.

---

## 2. How the app draws a hatch (`sketch/hatch.js`)

A hatch item is a closed polygon (`pts`, real inches) plus a pattern key. Drawing is done by `SK.hatchPrims(item, factor)`. An empty result means no fill will show.

| Kind | How it draws | Example keys |
|---|---|---|
| Lines (`fams`) | Parallel lines at an angle, with a spacing | `wood1`, `brick`, `plywood`, `gypsum`, `insulation`, `rigid`, `earth` |
| Wavy line (`zig`) | Wave rows, for loose batt insulation | `batt` |
| Running bond (`blocks`) | Course lines, with joints offset every other course | `cmu` |
| Stipple (`dots`) | One dot per cell, placed by a fixed hash, so it never changes | `concrete`, `gravel`, `screen` |
| Solid (`solid`) | A filled region | `steel` |

**How it works, and what to know:**
- **Spacing is on paper.** Spacing is in paper inches, multiplied by the scale factor (3"=1'-0" is factor 4). The same pattern looks the same at any drawing scale.
- **The error margin.** Lines stop 1/32 paper inch short of the boundary, so the fill never touches the outline.
- **Angles run with y down.** A positive angle runs down to the right (`\`). An up-to-the-right line (`/`) is a negative angle. This is the source of the brick mismatch in section 5.
- **Patterns are deterministic.** Stipple uses a fixed hash, so the same region draws the same dots every time. Tests check this.

---

## 3. Reference sheets we have

The images are saved in `docs/hatch/reference/`. Read them there, not from the chat.

| File | What it is | Used for |
|---|---|---|
| `01-hatch-basic-sheet.jpg` | The seven-entry "Hatch" sheet: solid, concrete, sand / cement, block, brick (diagonal), brick (running bond), timber | **The classic.** Batch 1 starts here. |
| `02-engineering-material-hatches-A-R.png` | Lettered A to R, material by material (metals, plastics, insulation, concrete, earth, rock, sand, water, wood across and along the grain). Copyright 2011 McGraw-Hill Companies. | Metals and insulation by type; wood grain |
| `03-building-drawing-symbols.jpg` | Brick, sand/plaster, cement, stone, earth, concrete, concrete block, steel, glass, R.C.C. | Building-drawing vocabulary |
| `04-cad-hatch-library-stones-parquet.jpg` | CAD library with names (STONES, RIVERROCK, GRAVEL, SAND, CONCRETE, PARQUET, WATER, THERMAL, PLASTIC, LOG, and others) | Stone, paving, landscape |
| `05-cad-hatch-library-scaled-stone-wood.webp` | CAD library with names and default `Scale=` values (Wood3, Ghiaia, Pietra, Legno, Tronco, Carbon) | Stone and wood, with scale notes |
| `06-architectural-materials-symbolic.webp` | Named symbolic set: cast iron, steel, titanium, aluminium, zinc, rubber, sand, concrete, earth, plywood, insulation, glass, terrazzo, cork, granite, basalt, and others | Metals, plywood, insulation, glass |
| `07-cad-hatch-library-bond-paving.jpg` | CAD library: brick bonds, paving, tile, roofing (SPANTILE, ENGLISH, FLEMISH, STAGGER, and others) | Brick bonds, paving, roofing |
| `08-cad-hatch-library-stone-bond-wood.gif` | CAD library: brick bonds, stone, endgrain, logend, hardwood, panel | Brick, stone, wood grain |

**Source notes.** Sheets 04, 05, 07 and 08 are CAD libraries; their origin is not recorded in the repo. Sheet 02 carries a McGraw-Hill copyright notice. Decide before committing these images (see the lessons file).

---

## 4. Agreed conventions and proposals

### 4.1 Agreed

- **The classic is the seven-entry sheet** (`01`). Its entries are the first batch. Other sheets are reference only until their batch is agreed.
- **Keys name the material, not the look.** A key is `concrete`, `brick`, `steel`. A new key is added only through a batch.
- **Each key cites its reference file** in the batch entry, so the source is known.
- **Each new key has a test** in `tests/hatch.js`, and `SK.hatchPrims` must return a fill for it.- **Drawn examples are tagged.** A reference sheet drawn by the AI carries `AI` and `draft` and `"ai_inferred": true`, as `docs/examples/hatch-batch-1-classic.json` does.

### 4.2 Proposed, awaiting agreement

| Material | Current app | Reference says | Proposal |
|---|---|---|---|
| Brick, diagonal | `brick`, 45 degrees, runs `\` | `01` runs `/` (up to the right) | Use a negative angle for `brick`. Check existing examples first. |
| Brick, running bond | none (`cmu` draws it, but its name is block) | `01`, `03`, `07`, `08` | New key, `brick-bond`, sized for brick courses. Keep `cmu` for concrete block. |
| Concrete block, diagonal | none (`cmu` is running bond) | `01` and `03` show a diagonal crosshatch | New key `block` for the diagonal crosshatch. |
| Timber | `wood1`, horizontal lines | `01` shows vertical boards with breaks | New key `timber`, with board breaks. Keep `wood1` for grain. |
| Sand / cement | `screen`, very dense | `01` shows sparse dots | New key `sand`, sparse dots. Keep `screen` as a light tone. |
| Concrete | dots only | `01`, `03` add small triangles | Add triangles as an option in the `concrete` key, or a new `concrete-agg` key. |

### 4.3 Open decisions

- **Steel.** The app's `steel` is solid. `02-B`, `03`, `06` draw steel as diagonal lines. Pick solid, lines, or both (solid for the classic, lines for the metals batch).
- **Wood across the grain.** `wood2` is 45 degree lines. `02-R` draws end grain as rings. Pick one.
- **Insulation.** Batt (`batt`) and rigid (`rigid`) exist. `02-G/H/I` and `06` show further types (thermal zigzag, sound with ovals, loops). Decide which get keys.
- **Earth.** `earth` is a 30 degree crosshatch. `02-N` and `03` show earth with stipple. Pick one.
- **Glass.** No key exists. `03`, `06`, and `02-M` show short diagonal dashes. Decide whether glass gets a key in batch 1 or later.
- **Plywood.** `plywood` is a grid. `06` shows a herringbone or chevron. Decide.

---

## 5. Batches

| Batch | Scope | Status |
|---|---|---|
| 1, classic | The seven entries of `01` | **Drawn as a reference sheet** (`docs/examples/hatch-batch-1-classic.json`), using the nearest existing keys. Gaps are listed in 4.2. Keys not yet built. |
| 2 | To be agreed. Candidates: metals and plastics from `02` A to F, insulation from `02` G to I and `06`, stone and earth from `03` and `05`, wood grain from `02` R and `08`. | Not started |

A batch is done when: its keys are in `sketch/hatch.js`, each has a test, a reference sheet in `docs/examples/` draws every key (`SK.hatchPrims` returns a fill), and the sheet has been rendered and looked at.

---

## 6. Rules

- Hatch is a drawing convention, never a specification. Never claim a hatch meets a listed assembly or a code.
- Put a note beside each hatch that names the material.
- Never write to the cloud library from a hatch batch. A reference sheet goes to `docs/examples/` first.
- Keep the reference images in `docs/hatch/reference/`. They are source material, not app assets.

---

## 7. Questions to answer before batch 1 is built

1. Brick: confirm `/` (up to the right) is the standard, and that `brick` should be changed to match.
2. Steel: solid or lines in the classic?
3. Is the sheet `01` the classic, as the first batch? Or is a different set meant?
4. Are the images in `docs/hatch/reference/` allowed in the repo, given the McGraw-Hill notice on `02`?
