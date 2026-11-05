---
name: ai_draft_detail
description: Draft a new construction detail on the canvas with the AI. Writes a drawing spec (lines, rectangles, fills, notes, dimensions in real inches), checks it with SK.authorDetail, and draws it into the Quick Detail canvas as a new detail, tagged AI and draft. Covers wall, roof, window, door and similar assembly details. Works in increments, each one a new canvas detail. Use when the user says "ai_draft_detail [subject] [increments] [layout] [name] [flags]".
---

# ai_draft_detail

Adapted from `ai_collab`. Where `ai_collab` marks up a construction detail that exists, this skill drafts a new one and draws it into the canvas. The drawing is the AI's draft, so every item is tagged and every spec carries a "Draft: verify before use" note. Nothing existing is overwritten.

Scope: construction details only, such as wall, roof, window, door, floor, and penetration assemblies. Site plans, floor plans, and sections are out of scope.

## Input

`ai_draft_detail [subject] [increments] [layout] [name] [flags]`

**Required**

- **Subject**: the assembly, in words, for example "exterior wall at a window head, CMU with 1-hour rating". If it is unclear, ask for clarification before doing anything else. Do not guess the assembly.

**Optional**

- **Increments**: how many steps to draw. Accepted forms are `3`, `3 steps`, `3 inc`, and `3 increments`. Default 1. Each increment is cumulative and becomes its own canvas detail, so the last one holds everything. Versions are numbered v01, v02, and so on, one per increment.
- **Versions**: the number of options for `[multi]`, written as a single number (`3 versions`) or a range (`2-5 versions`). A range is narrowed to one number at validation, and the choice is stated there. Default 3.
- **Layout**:
  - `[default]`: a single detail, developed in layered increments. This is the default when no layout is given.
  - `[multi]`: the AI explores several versions of the detail. It labels them A, B, C, and so on, and the user and AI work through them together. Labels take a letter for the option and a number for its round, such as A1, B2, C1. Once the user picks one, it is developed as a single detail through increments.
- **Name**: the detail's name. If none is given, propose one that says what it is and mark it "(AI draft)".
- **Hatches**: each hatch has a **Hatch Name**, a **Material Description**, and an internal **tracking number**. Items refer to a hatch by its tracking number. One hatch can be reused across several items and several details. Hatches live in the shared registry `research/detail/hatches.json`, so a tracking number means the same thing on every detail. A hatch named in the command but missing from the registry is added at validation, once the user confirms it.
- **Flags**:
  - `[research]`: run the research step (see Steps) before drafting.
  - `[no input]`: skip the command check and the clarifying questions, and pick sensible defaults. Say in the report which reading was taken.
  - `[3d]`: also build a 3D model with the make3d repo, once the design is past v05 (see Steps).
  - `[dry run]`: run validation and planning only. No specs, PNGs, canvas drawings, or cloud writes.

**Category**: the assembly's category (`hatch`, `roof`, `footing`, `door`, `wall`, `window`, and so on) is inferred from the subject and confirmed at validation. It sets the research folder.

## Validation

Validation runs first, before any drawing, and asks everything in one batch:

1. **Command.** Restate the parsed command: subject, increments, versions, layout, name, category, hatches, and flags. Mark each as given or defaulted. Confirm it.
2. **Clarifications.** Ask any question the command leaves open: unclear subject, scupper or penetration location, a range that needs narrowing, a hatch missing from the registry, or a name to propose. Ask them together, not one at a time.
3. **Database.** Cloud rights are assumed to be given by default. Check that the Architecture project is reachable and that the viewer tables `viewer_sets` and `viewer_scenes` exist. If they are missing or unreachable, say so and offer the local fallback under Output. Do not continue to a cloud write without confirming access.
4. **Repos.** Check the increment viewer repo is in the session for step 9. If `[3d]` is set, check the make3d repo too.

Stop at validation until the user confirms. `[no input]` skips the questions and takes defaults, but still checks database access.

## Scale and text

- Scales come from `SK.SCALES` in `sketch/units.js`. Details are normally drawn at a larger scale than the sheet, such as `3"=1'-0"` or `1-1/2"=1'-0"`. Check the scale against the detail's size before drawing.
- Positions are real inches. Dimensions are written in real inches as well.
- Notes are sized with `text_scale` in the spec. Set it so labels read at fit-to-view.
- A label that is 1 to 3 words is a label, and one line is right. Anything longer is a block: 4 to 10 words a line (see `note_text_blocks`).
- Every item has a note that names it and says what the reader sees, and states what is still to decide.

## Steps

1. **Validate.** Run the Validation section above. Wait for the user's confirmation and answers.
2. **Research** (only with `[research]`). Create a research folder for this detail at `research/detail/<category>/<name>/`. Then:
   - Search the existing library for similar details, and read their JSON descriptions in `docs/examples/`.
   - Search online for published references.
   - Dissect the general conditions, the details, and the materials, and flag possible complexities such as rating, drainage, movement, and thermal bridging.
   - Save the findings in the research folder, and review them with the user before drafting. Do not continue until they confirm.
3. **Read the subject.** Look at the existing examples for the same kind of assembly first: hatches, footings, doors, and so on, in `docs/examples/` and `research/detail/<category>/`. Check every component the detail uses against the library and the spec format. A component that does not exist is not drawn: report it and leave it out. Never invent one. Check that every hatch tracking number an item uses appears in `research/detail/hatches.json`. State the assumptions (layer thicknesses, substrate, fastener spacing, rating) and mark them as placeholders.
4. **Plan the increments.** Write the steps in order: base layer (substrate and structure), then the next layer (insulation, membrane, cladding), then the last (flashing, sealant, notes and dimensions). Each increment repeats the earlier layers, so it stands alone.
   - With `[multi]`, draft the options (A, B, C, and so on, up to the chosen number of versions). Give each option a confidence score from 0 to 1 for how well it matches the reference, with one line on why. Use 0 for a placeholder where no reference exists. Show the options to the user and pick one before layering.
5. **Write the generator** in `tools/generator/<kind>.js`. A construction detail uses `tools/generator/detail.js`, which holds the shared `writeIncrements` pattern. A site plan uses `tools/generator/siteplan.js`, and elevation, floor plan, and isometric generators get their own files in the same folder. Each generator writes one spec per increment to `docs/examples/<name>/`. Each spec has `name`, `scale`, `tags` (including `AI` and `draft`), `ai_inferred: true`, `text_scale`, `version`, and `items`. Every note has a `tip`. Run it and fix any spec that throws.
6. **Check the notes.** `node tools/note-blocks.js docs/examples/<name>/*.json`. Fix any note the checker flags, by changing its width or its wording. The rules are in the header of `tools/note-blocks.js`, and in the `note_text_blocks` skill.
7. **Draw into the canvas.** `node tools/draw-canvas.js docs/examples/<name>/*.json --out research/detail/<category>/<name>/review`. This opens the app in headless Chromium, calls `window.QuickDetail.draw(spec)` for each spec (the same path as the JSON panel's "Create detail"), fits the view, and saves a PNG per increment. Exit code 1 means a spec failed or the page threw. Fix it and run again.
8. **Look at the renders.** Check orientation, that labels read, that notes do not sit on the drawing where they hide it, and that the draft note is there. Note any overlap in the report.
9. **Track the versions in the increment viewer.** The increment viewer is its own repo (`viewer.html`). Each increment is one scene, `[multi]` options are branches, and the exported file is what gets shared. Write the version record to the viewer tables in the Architecture Supabase project, as these details are architectural. Cloud rights were confirmed at validation. Each detail is one row in `viewer_sets` (`set_id` from the detail's name and category, with `label`, `title`, and `subtitle` taken from the detail). Each increment is one row in `viewer_scenes` under that `set_id`, with `position` set to the version number and the scene in `item`. A `[multi]` option is its own set, with its own `set_id`, and the chosen option is marked in the set's `subtitle`. Write with one batch, after the user confirms.
10. **Build the 3D model** (only with `[3d]`, and only past v05). Build the model with make3d from the latest version.
11. **Report.** Give each increment's name, version, item count, spec path, and PNG path. List what is still open for review, and any assumption that needs a product spec, a code check, or a reference.

## Output

- **Canvas**: each increment is a new canvas detail, tagged `AI` and `draft`.
- **Files**: specs in `docs/examples/<name>/`. PNGs and research notes in `research/detail/<category>/<name>/`.
- **Hatch registry**: `research/detail/hatches.json`. New hatches confirmed at validation are added here.
- **Increment viewer**: version records for each increment, written to `viewer_sets` and `viewer_scenes` in the Architecture project. Each detail is a set, and each increment is a scene at its version position. `[multi]` options are separate sets, and the chosen option is marked in its set's subtitle.
- **Local fallback**: if the database is unreachable or the table is missing, and the user does not fix it, version records are kept as a local file and the report says they were not written.
- **3D model** (only with `[3d]`): built from the make3d repo, after v05.
- **Dry run** (`[dry run]`): the report lists what would be drawn and written, and writes nothing.

## Rules

- Tag every output `AI` and `draft`. A human-drawn detail is never tagged AI.
- Every spec carries a "Draft: verify before use" note. Never claim a detail is code-compliant, rated, or meets a listed assembly.
- This skill draws into the canvas only through `window.QuickDetail.draw`. Cloud writes go only to `viewer_sets` and `viewer_scenes`.
- Keep each increment cumulative, so the last one is the complete drawing.
- Commit and push at the end of a run when the session's stop hook requires it. Merge only when the user asks.

## Cloud library upload

After the increments are drawn and checked, upload the draft to the cloud library as one detail with its increments as a linear history:

```bash
SUPABASE_URL=<Architecture project URL> SUPABASE_SERVICE_KEY=<service role key> \
node tools/library/upload-draft-history.js --specs <docs/examples/<name>> --local-id <ai-name> \
  --name "<Name> (AI draft)" --scale '<scale>' [--renders <render dir>] [--tags "<tags>"] --upload
```

Run it without `--upload` first to check the plan. The tool writes only to `sketch_details` and `sketch_versions`. See `tools/library/upload-draft-history.js`.
