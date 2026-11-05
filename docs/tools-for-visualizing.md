# Tools for seeing the drawing

The AI works from code, so it can't look at a sheet the way a person does. These tools give it eyes: a zoom, a numbered map and a collision check. Each one runs the app's own drawing code in headless Chromium, so what it measures is what the app shows.

## Built

### `tools/sheet.js`

| Command | What it does | Example |
|---|---|---|
| `crop` | Zooms into one rectangle of a sheet, in real inches, at any width in pixels. | `node tools/sheet.js crop docs/rand-hall/history.json --lane 0 --rect 2250,-350,4950,750 --out crop.png` |
| `map` | The whole sheet, with each note's text outlined and numbered in file order. Use the numbers to ask for a crop. | `node tools/sheet.js map <src> --out map.png` |
| `overlaps` | Lists notes whose text runs into another note's text, or over linework or hatch. Exit code 1 if anything is found. Add `--json` for a file. | `node tools/sheet.js overlaps <src>` |

`<src>` is a detail spec (`docs/examples/*.json`, built as the app would) or a history bundle (`docs/rand-hall/history.json`, with `--lane` picking the root lane).

**How it was checked.** The first version measured each note's whole box, so it reported five text collisions that weren't there (for example "West stair" and "Shop / review" on the first-floor plan). The second version measures each line of text, and reports zero note collisions. Its one real finding, "Entry (assumed)" crossing the door arc, matches what the render shows.

**Limits.** It doesn't check leaders (an arrow crossing a wall is normal). It doesn't check dimension text or linework against linework.

### `tools/note-blocks.js` (already merged)
Checks that every note wraps to 4 to 10 words a line. See the `note_text_blocks` skill.

## Proposed, not built yet

1. **Render diff.** Compare two renders of the same view and show only the pixels that changed. This would make each text pass easy to review, instead of comparing two images by eye.
2. **Scale ruler and grid overlay.** Draw a 1-foot grid and a scale bar over any render, so dimensions can be checked against the drawing at a glance.
3. **Isometric alignment check.** Project points from the plan and elevations into the isometric, and report any feature that lands more than a set tolerance away from where its plan position puts it.
4. **Spec linter.** Check hatch keys, unique ids, notes that have a tip, and dimensions whose ends sit on a drawn line. Some of this already happens when `authorDetail` throws, but not all of it.
5. **App screenshot check.** Drive the real Quick Detail pages (library, log, viewer) in Chromium and screenshot them, so the app's own screens can be checked as well as the drawings.
6. **Library payload compactor.** Reduce a sheet's items to fit the Supabase library row, with a size report, so cloud saves don't depend on hand-trimming. (The 2-D sheet today is about 190 KB after compacting, which is too large to write through a SQL call.)

## How we can work together

- **Send me images.** I can read PNG and JPEG files you upload directly. Archive drawings, photos, or screenshots from Quick Detail all help. Say which view each one shows and which way is north.
- **Refer to notes by number.** "Note 27 crowds note 28" is faster than a description. The `map` command gives the numbers.
- **Expect this from me at each review.** The render, the map, the overlap count, and the spec path. If the count isn't zero, I'll say which notes are still open and why.
- **Decide where a sheet goes.** The Quick Detail library needs the compactor first. Until then, a published page (as with the 2-D sheet) is the cloud copy.
- **Pick the drafting method.** Iterations (as for Rand Hall), or the three A/B/C variants that the `draft_AI_detail` skill asks for.
