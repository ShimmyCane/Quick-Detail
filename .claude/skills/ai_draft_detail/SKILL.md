---
name: ai_draft_detail
description: Draft a new construction detail on the canvas with the AI. Writes a drawing spec (lines, rectangles, fills, notes, dimensions in real inches), checks it with SK.authorDetail, and draws it into the Quick Detail canvas as a new detail, tagged AI and draft. Covers wall, roof, window, door and similar assembly details. Works in increments, each one a new canvas detail. Use when the user says "ai_draft_detail [subject] [layout] [name] [flags]".
---

# ai_draft_detail

Adapted from `ai_collab`. Where `ai_collab` marks up a construction detail that exists, this skill drafts a new one and draws it into the canvas. The drawing is the AI's draft, so every item is tagged and every spec carries a "Draft: verify before use" note. Nothing existing is overwritten.

Scope: construction details only, such as wall, roof, window, door, floor, and penetration assemblies. Site plans, floor plans, and sections are out of scope.

## Input

`ai_draft_detail [subject] [increments] [layout] [name] [flags]`

**Required**

- **Subject**: the assembly, in words, for example "exterior wall at a window head, CMU with 1-hour rating". If it is unclear, ask for clarification before doing anything else. Do not guess the assembly.

**Optional**

- **Increments**: how many steps to draw. Default 1. Each increment is cumulative and becomes its own canvas detail, so the last one holds everything. Versions are numbered v01, v02, and so on, one per increment.
- **Layout**:
  - `[default]`: a single detail, developed in layered increments. This is the default when no layout is given.
  - `[multi]`: the AI explores several versions of the detail. It labels them A, B, C, and so on, and the user and AI work through them together. Labels take a letter for the option and a number for its round, such as A1, B2, C1. Once the user picks one, it is developed as a single detail through increments.
- **Name**: the detail's name. If none is given, propose one that says what it is and mark it "(AI draft)".
- **Hatches**: a list of hatches, each with a **Hatch Name**, a **Material Description**, and an internal **tracking number**. Items refer to a hatch by its tracking number. One hatch can be reused across several items and several details.
- **Flags**:
  - `[research]`: run the research step (see Action) before drafting.
  - `[no input]`: skip the command check below and pick sensible defaults. Say in the report which reading was taken.
  - `[3d]`: also build a 3D model with the make3d repo, once the design is past v05 (see Action).

**Command check**: before any drawing, restate the parsed command to the user once: subject, increments, layout, name, hatches, and flags, each marked as given or defaulted. Confirm it, then proceed. `[no input]` skips this check.

## Scale and text

- Scales come from `SK.SCALES` in `sketch/units.js`. Details are normally drawn at a larger scale than the sheet, such as `3"=1'-0"` or `1-1/2"=1'-0"`. Check the scale against the detail's size before drawing.
- Positions are real inches. Dimensions are written in real inches as well.
- Notes are sized with `text_scale` in the spec. Set it so labels read at fit-to-view.
- A label that is 1 to 3 words is a label, and one line is right. Anything longer is a block: 4 to 10 words a line (see `note_text_blocks`).
- Every item has a note that names it and says what the reader sees, and states what is still to decide.

## Confidence

- When a drawing offers versions, give each a confidence score from 0 to 1 for how well it matches the reference, with one line on why. Use 0 for a placeholder where no reference exists.

## Action

1. **Validate the command.** Run the command check from Input. Stop if the subject is unclear and wait for the user.
2. **Research** (only with `[research]`). Create a research folder for this detail at `docs/research/<name>/`. Then:
   - Search the existing library for similar details, and read their JSON descriptions in `docs/examples/`.
   - Search online for published references.
   - Dissect the general conditions, the details, and the materials, and flag possible complexities such as rating, drainage, movement, and thermal bridging.
   - Review the findings with the user before drafting. Do not continue until they confirm.
3. **Read the subject.** Check every component the detail uses against the library and the spec format. A component that does not exist is not drawn: report it and leave it out. Never invent one. Check that every hatch tracking number an item uses appears in the Hatches input. State the assumptions (layer thicknesses, substrate, fastener spacing, rating) and mark them as placeholders.
4. **Plan the increments.** Write the steps in order: base layer (substrate and structure), then the next layer (insulation, membrane, cladding), then the last (flashing, sealant, notes and dimensions). Each increment repeats the earlier layers, so it stands alone.
   - With `[multi]`, first draft options A, B, C, and so on. Show them to the user and pick one before layering.
5. **Write the generator** in `tools/<name>.js`, following the pattern of the existing generators in `tools/`. It writes one spec per increment to `docs/examples/<name>/`. Each spec has `name`, `scale`, `tags` (including `AI` and `draft`), `ai_inferred: true`, `text_scale`, `version`, and `items`. Every note has a `tip`. Run it and fix any spec that throws.
6. **Check the notes.** `node tools/note-blocks.js docs/examples/<name>/*.json`. Fix any note the checker flags, by changing its width or its wording.
7. **Draw into the canvas.** `node tools/draw-canvas.js docs/examples/<name>/*.json --out docs/<name>/review`. This opens the app in headless Chromium, calls `window.QuickDetail.draw(spec)` for each spec (the same path as the JSON panel's "Create detail"), fits the view, and saves a PNG per increment. Exit code 1 means a spec failed or the page threw. Fix it and run again.
8. **Look at the renders.** Check orientation, that labels read, that notes do not sit on the drawing where they hide it, and that the draft note is there. Note any overlap in the report.
9. **Track the versions in the increment viewer.** The increment viewer is its own repo (`viewer.html`). Each increment is one scene, `[multi]` options are branches, and the exported file is what gets shared. Write the version record to the increment viewer table in the Architecture Supabase project, as these details are architectural. This is a cloud write, so it runs only with the rights described under Output.
10. **Build the 3D model** (only with `[3d]`, and only past v05). Confirm the make3d repo is in the session first. If it is not, ask the user to add it, and stop until it is. Then build the model with make3d from the latest version.
11. **Report.** Give each increment's name, version, item count, spec path, and PNG path. List what is still open for review, and any assumption that needs a product spec, a code check, or a reference.

## Output

- **Canvas**: each increment is a new canvas detail, tagged `AI` and `draft`.
- **Files**: specs and PNGs in `docs/examples/<name>/` and `docs/<name>/review/`, plus the research folder if one was made.
- **Increment viewer**: version records for each increment, written to the increment viewer table in the Architecture project. `[multi]` options are recorded as branches, and the chosen option continues as the main line.
- **Rights**: the cloud write in step 9 depends on the layout and on cloud rights. A `[default]` run writes its version records only after the user grants cloud rights for that run. A `[multi]` run asks for the rights before the first option is recorded. Without rights, the version records are kept as a local file and the skill reports that they were not written.
- **3D model** (only with `[3d]`): built from the make3d repo, after v05.

## Rules

- Tag every output `AI` and `draft`. A human-drawn detail is never tagged AI.
- Every spec carries a "Draft: verify before use" note. Never claim a detail is code-compliant, rated, or meets a listed assembly.
- This skill draws into the canvas only through `window.QuickDetail.draw`. Cloud writes go only to the increment viewer table, and only with the rights described under Output.
- Keep each increment cumulative, so the last one is the complete drawing.
- Commit, push, and merge only when the user asks. The specs, PNGs and generator are the review copy.
