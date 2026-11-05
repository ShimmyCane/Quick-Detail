---
name: building_from_research
description: Research a real building from public sources and draw it in a capped number of iterations (site, plans, elevations, section, then an isometric of a chosen view), recorded as a lane tree that the edit-history viewer replays. Use when the user asks to research and draw a building, with or without giving input.
---

# building_from_research

Built from the Rand Hall run (5 Nov 2026; see `docs/rand-hall/`, `tools/rand-hall.js` and the lessons log, sections 11 and 12). The output is an AI draft from published sources. It is never a survey.

## Stage 1: References, visual first

1. **Check the network before searching.** Call `get_environment`. Reference hosts are usually blocked in the default environment: Wikimedia Commons, Wikipedia, OpenStreetMap tiles and Overpass, and blogs. If the task needs them, ask once for the whole list in one change (see `mcp__claude-code-remote__create_environment` or `update_environment`). Do not find out one blocked host at a time.
2. **Gather visual references, not only text.** Collect:
   - a map or aerial view of the site (OpenStreetMap; a Google static map needs an API key, so ask for one or say that it is missing)
   - the footprint outline (OSM Overpass, `way[building]` around the site)
   - 3 to 6 photos that show the facades in the period the user named, with their source and licence
   - articles that give dimensions, dates, materials and changes over time
3. **Save downloads in their own new folder** in the scratchpad, never in the repo, unless their licence allows it and the user asks.
4. **If a reference cannot be reached, say so before drawing**, and say what it would have settled. The user expects pictures. A text-only draft should be a choice the user knows about, not something they discover later.
5. If the user says to stop or to drop a part of the research, stop at once and carry on without it.

## Stage 2: Facts and assumptions

- List the facts with a source for each.
- List the assumptions as numbered open items, each saying what it was inferred from. For example: "10 bays of 20 ft, from 20 new beams at two to a bay".
- Mark the weakest ones: these are what photos or archive drawings would settle.
- Write both lists to `docs/<building>/README.md`.

## Stage 3: Plan the iterations

- Keep to the user's cap. Ten worked for one building:
  - main line: site, grid and ground plan, upper plan, roof plan, elevation pass 1, elevation pass 2, end elevation and section
  - one branch: an option for an uncertain element
  - one branch: the isometric of the chosen view, first as massing and then detailed
- Choose the isometric view from the elevations that are most worked out, and say why.
- Every iteration has a title note that starts `ITERATION n:` and says what it adds.

## Stage 4: Draw

- Copy the pattern in `tools/rand-hall.js`. It has building constants in feet, one origin per view on one sheet in real inches, a `Sheet()` builder, and one function per iteration.
- Prefix the ids with the iteration number, so they stay unique across the whole tree.
- Use `1/4"=1'-0"` for a building (the smallest scale the app has). Draw a site plan at a reduced scale and say so in its title.
- Follow `note_text_blocks` for every note.

## Stage 5: Record the iterations for the viewer

- Use one recording per lane. Each iteration is one scene. Separate the scenes by a gap longer than `SK.IDLE_MS` (3 s) and a `mark` event.
- A branch's `base` is its parent's sheet at the fork step. Give the branch `fork: { step }`.
- Strokes are `put` events with `anim: true` and timed points, so the viewer replays them line by line.
- Each scene gets a sentence of "speech", which the viewer shows as its words. Add a note naming its spec file.
- Write the exported viewer the same way Export HTML does: `viewer.html` with the stylesheets, the scripts and the bundle inside.
- Check in Node that `SK.segment` gives each lane the number of scenes planned.

## Stage 6: Review before showing

- Render each iteration framed on its own items, and the whole sheet (see `tools/rand-hall-render.js`), and look at every image.
- Run `node tools/note-blocks.js --strict` on the specs.
- Fix what you find as a further pass. If the user asks for passes, keep the renders of each one (`review/text-pass-0`, `-1`, `-2`).

## Stage 7: Deliver

- Send the exported viewer and the key renders to the user.
- Make a branch, a draft PR and an entry in the lessons log. Merge only when the user asks. Before merging, check whether the repo runs CI, run the tests locally, and say what you checked.

## Rules

- Tag every spec `AI` and `draft`, with `ai_inferred: true`.
- Never claim a dimension is measured. Every view's title or a note says it is assumed.
- Never write to the cloud library without asking.
