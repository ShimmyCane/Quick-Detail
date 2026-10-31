# Lessons learned: hatch

What the hatch work has taught us. The shared reference is `docs/hatch-reference.md`; this file records why it says what it says. Newest entries first. Keep entries short, and record the decision and why.

---

## Entries

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
