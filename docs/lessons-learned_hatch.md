# Lessons learned: hatch

What the hatch work has taught us. The shared reference is `docs/hatch-reference.md`; this file records why it says what it says. Newest entries first. Keep entries short, and record the decision and why.

---

## Entries

### 2026-10-31: classic set, versions with confidence

- **Classic:** the ten-entry Building drawing symbols sheet is the starting point. The seven-entry sheet is superseded. The "5116" request was this sheet; it was found by the user, not by search.
- **Feedback taken:** earlier drafts did not match the user's reading. Likely cause: too many references at once. Next draft uses one reference only.
- **Built:** `ai-draft-classic-hatch-versions`, 90 items. Each entry has up to three versions with a confidence score. Versions use existing keys only; placeholders mark keys not built.
- **Text:** notes at 4 times the earlier size, per the user's note that asset sheets read larger. Recorded as `text_scale` in the skill.
- **Lesson:** a confidence score is only as good as the match check. Several scores here are my estimates from the render, not measured. The user's review is the check.
- **Lesson:** the render script did not show text size until it applied the note size. A review copy must use the same sizes as the cloud row.
- **Copyright:** the classic is a watermarked stock preview. Kept in the reference folder, not committed.

### 2026-10-31: ai_draft_detail skill, classical set, merge

- **Created:** `.claude/skills/ai_draft_detail/SKILL.md`, adapted from `ai_collab`. It makes a new detail, not a markup. Options A and variations B are spaced on the canvas, with numbered annotations. One new cloud row per run.
- **Detail:** `ai-draft-classical-hatch-set-options` in `sketch_details`, 57 items, tags AI, draft, hatch. Spec `docs/examples/classical-hatch-set-options.json`. Render `docs/hatch/review/classical-hatch-set-options.png`.
- **Assumption:** "the 11 classical hatches" means the 11 keys that draw today. Confirm before redrawing.
- **Dropped:** IMG_5116. Not found in the cloud, repo, history, or uploads. The user asked to ignore it.
- **Lesson:** a multi-row layout needs the notes and tips to be checked against the row pitch. A note placed on the wrong row only shows in the render, not in the item count.
- **Lesson:** the variation B patch is the same key at a larger size. It shows repeat, not a different design. A true alternative needs a new key, which waits on the palette decisions.
- **Merge:** PR #34 merged after this entry. The branch carries the reference doc, palette plan, brick options, starting point, and the ai_draft_detail skill.

### 2026-10-31: review round (brick options, steel, starting point, cloud draft)

- **Decided:** steel is two diagonal lines, not solid. Solid becomes its own key (P-16). The first batch is renamed the **starting point**.
- **Open:** brick angle (B-01 to B-05 in `docs/hatch/review/brick-options.png`, B-02 recommended). Other open points are marked in `docs/hatch/palette-plan.md`.
- **Cloud:** inserted `ai-hatch-starting-point` into `sketch_details` as a draft for review, with tags AI, draft, hatch, review. The insert was a new row only.
- **Not found:** a sheet "ending in 5116". No file, cloud row or commit has that ending. Ask before renaming anything else.
- **Lesson:** an insert that wraps items in an object fails at the array check. Items must be a bare JSON array. The failed insert left no row, which was checked before retrying.
- **Rule:** the cloud draft is a review copy. It does not replace any row, and the drafting skill's "never write to the library" rule is not in play here because this was asked for directly.

### 2026-10-31: first hatch session (reference sheets and batch 1 draft)

- **Done:** eight reference images saved to `docs/hatch/reference/`; `docs/hatch-reference.md` written (how hatches work, sheets, proposals, open decisions); `docs/examples/hatch-batch-1-classic.json` drawn as a reference sheet of the seven classic entries, tagged AI and draft.
- **Not done:** no change to `sketch/hatch.js`. The proposals in the reference doc wait for agreement. Nothing committed or pushed.
- **Checks:** the spec builds with `SK.authorDetail`; every hatch key on the sheet returns a fill from `SK.hatchPrims`; `node tests/hatch.js` passes. The sheet was also rendered to a scratch PNG and looked at. The render found two errors that the numbers did not show (below).
- **Next time:** agree the open questions in `docs/hatch-reference.md` section 7 before building batch 1 keys.

---

## Lessons

### Look at the drawing, not only the numbers

- The checks passed, but the render showed the brick key draws the wrong way: `\` where the reference is `/`. It also showed the sand/cement key is far denser than the reference. Neither failure shows up in a fill count.
- **Rule:** after a batch is drawn, render it and look at it, every time. Keep the render in scratch space, not in the repo, unless the user asks for it.

### The angle convention runs with y down

- In `sketch/hatch.js`, a positive angle runs down to the right. A reference `/` line needs a negative angle. This is why `brick` is mirrored against the classic sheet.
- **Decision pending:** change `brick` to a negative angle. Check the existing examples that use `brick` first. The change is not made in this session.

### References disagree, so each key needs one source

- The same material is drawn differently across the sheets. Concrete has triangles on `01` and `03` and none in the app. Steel is solid in the app, but diagonal lines on `02-B`, `03` and `06`. Earth is a crosshatch in the app, stipple and bands on `02-N` and `03`.
- **Rule:** each key cites the one reference file it follows. A key that follows a different sheet from the classic says so in its batch entry.

### Names must describe the material

- The app's `cmu` draws running bond, but its name says concrete block. The classic's "brick (running bond)" is drawn with `cmu` in the reference sheet. The shape is right, the name is wrong.
- **Rule:** a key is named for the material it stands for, not for the look. A new key is added for each material that is missing (`brick-bond`, `block`, `timber`, `sand`).

### Gaps show up in a reference sheet, so draw it before building

- Batch 1 has five gaps: block (diagonal), brick running bond, timber (vertical boards), sand (sparse dots), and the concrete triangles. The reference sheet shows them openly. An empty swatch is better than a wrong hatch passed off as correct.
- **Rule:** when a key does not exist yet, leave its swatch empty and say so in the note beside it. Do not borrow a key that means something else. `rigid` is an insulation key, so it must not stand in for block.

### Scale is on paper, and reference libraries carry their own scale

- The app's spacing is in paper inches times the scale factor, so one pattern looks the same at any drawing scale. Sheet `05` gives a default `Scale=` for each pattern, which is a different convention.
- **Rule:** keep the app's paper-inch spacing. Do not copy the `Scale=` values from `05` into the keys.

### Source and copyright

- Sheet `02` carried a McGraw-Hill copyright notice (2011). **Decided:** the image was deleted at the owner's request. Its catalogue entries are kept as our own notes.
- Sheets `04`, `05`, `07` and `08` are CAD libraries with no recorded source. They stay on disk in `docs/hatch/reference/`, not committed, for study only.
- **Rule:** we learn from references, we do not copy them. Every hatch is our own design, controlled and edited beyond the original drawing.
- **Rule:** a file of unknown origin stays untagged and is reported as unknown, as in the drafting skill.

### Tagging

- The reference sheet was drawn from the references, not from a human sketch. It is tagged `AI`, `draft` and `"ai_inferred": true`, and it carries the "Draft: verify before use" note.
- **Rule:** the same rule as the drafting skill. A sheet drawn by the AI is tagged AI even after it is accepted.

---

## Tools

- Scripts that check and render hatches live in `/tmp`, not in the repo. The check loads `sketch/core.js`, `units.js`, `hatch.js` and `author.js` in Node, then calls `SK.authorDetail` and `SK.hatchPrims`.
- Rendering uses the preinstalled Chromium at `/opt/pw-browsers/chromium`, launched with `--no-sandbox`. The SVG is built from the same primitives the app draws, so it shows what `hatchPrims` returns. Notes are drawn as plain text and do not wrap, so check note wrapping in the app itself.
- The hatch test (`node tests/hatch.js`) names every key, but a name check is not a draw check. The draw check is the one above.
