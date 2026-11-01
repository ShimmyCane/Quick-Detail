---
name: draft_AI_detail
description: Draft a new construction detail with AI in staged passes. Searches the library for references, asks scope questions, states assumptions, then drafts three loose variants (A, B, C) for review. Every output is tagged AI in the detail and in its JSON file. Use when the user asks to draft, sketch, or explore a new detail.
---

# draft_AI_detail

Use this for every new detail the AI drafts. The goal is a fast review loop: the user picks one variant, then redrafts it or accepts it with small changes. Drafts are loose. They are later turned into CAD files in another process, so a clean JPEG or PNG for a Bluebeam cartoon set is enough.

## Tagging (always)

- Add the tag `AI` and the tag `draft` to the detail's `tags`.
- Add `"ai_inferred": true` at the top level of its JSON spec in `docs/examples/`. This is the same flag the to-do file names (`docs/details-todo.md`).
- Name the file `<category>-<short-name>-<variant>.json`, for example `roof-curb-wood-framed-A.json`.
- Put the variant letter in the detail name, for example "Wood roof curb, variant A (AI draft)".
- Human-drawn work is never tagged AI. If a file's origin is unknown, leave it untagged and say so.

## Stage 1: Library lookup

Before drafting anything:

1. List the local references: `docs/examples/*.json`. Read the ones whose tags or assemblies match the request.
2. Check the cloud library (Architecture project, table `sketch_details`) for matching rows. This is read-only: never write to it from this skill.
3. Report the matches to the user in a short list: name, tags, and why it is or is not relevant. Ask which ones to use as reference. Do not copy a reference without saying so.

## Stage 2: Scope questions

Ask a small number of serious questions that change the drawing. Use AskUserQuestion. Good questions cover:

- Assembly and rating: is there a listed design (UL, GA), and what is the required rating?
- Wall, roof, or floor type, and the structure: wood, CMU, concrete, or steel.
- Location: exterior or interior, above or below grade, and climate zone if it affects insulation or vapour control.
- Roof slope, when the detail is roofing.
- Materials that are fixed by the project or the client.
- Scale and sheet size.
- Which reference detail, if any, from Stage 1 is the starting point.

If the user cannot answer, use the defaults in Stage 3 and say so.

## Stage 3: Assumptions

Write the assumptions as a numbered list before drafting. Base each one on the reference details and examples, and say which one it came from. Mark each assumption as accepted or open. The user reviews this list before the variants are drawn.

## Stage 4: Three variants

Draft three variants, A, B, and C. They should differ in a real way, such as a different membrane, insulation layout, or flashing method. Variants are explorations. Some are rejected, and some are combined.

For each variant:

1. Write a spec in `docs/examples/` following `sketch/author.js`. Positions are real inches, y down, in the `3"=1'-0"` scale unless the request says otherwise.
2. Include a "Draft: verify ... before use" note, as the existing roof drafts do.
3. Check it builds: load `sketch/author.js` in Node and call `SK.authorDetail(spec)`. A spec that throws is not done.
4. Export a JPEG or PNG for review. The app exports a 150 dpi JPEG with the title block (`sheetCanvas` in `sketch/app/export.js`). Use it from the browser, or note in the output that the image still needs exporting.

## Stage 5: Review loop

- Report the three variants with a one-line difference for each.
- The user picks one, asks for changes, or accepts it with minor tweaks. Redraft only what they ask for.
- Keep the user's accepted choice as the base for the next round. Record it in the lessons log.

## Lessons log (always)

After each run, add an entry to `docs/lessons-learned.md`:

- date and detail name
- references used, and any that were rejected
- questions asked and the answers
- assumptions accepted, changed, or rejected
- which variant was chosen, and what changed in review
- anything that went wrong, or that the next run should do differently

Read the log at the start of Stage 3, so earlier lessons shape the assumptions.

## Rules

- Never claim a detail is code-compliant. Every draft is for review against the listed assembly and the local code.
- Never write to the cloud library from this skill.
- Keep the AI tag on every file, even after the user has accepted a variant.
