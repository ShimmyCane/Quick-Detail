# Lessons learned

One place for what the work has taught us. Newest entries first within each section. Keep entries short, and record the decision and why, so the next run starts from it.

Sections:

1. [Version control log](#1-version-control-log): branches, PRs and merges, and the rules that came out of them.
2. [AI drafting](#2-ai-drafting-draft_ai_detail): the `draft_AI_detail` skill and its runs.
3. [AI markup](#3-ai-markup-ai_collab): the `ai_collab` skill and its rules.
4. [Cloud library](#4-cloud-library): what is stored, and what the review found.
5. [Tools and environment](#5-tools-and-environment): what works in this sandbox and what does not.
6. [Hatch](lessons-learned_hatch.md): hatch patterns. The shared reference is `hatch-reference.md`.
7. [Practice and rating](#7-practice-and-rating): how the owner works and judges a drawing.
8. [User interface](#8-user-interface): what to check before saying a UI change is live.
9. [Working lessons from the 31 Oct session](#9-working-lessons-from-the-31-oct-session): how the left bar, grid and scale work went, start to finish.

---

## 1. Version control log

The repo's history is the record of what changed. This log adds the decisions behind the merges. The in-app version log in Settings tracks the sheet app's own versions and is separate.

### Recent merges to `main`

| PR | Merged | What |
|---|---|---|
| #18 | 2026-10-29 | Quick Detail blocks |
| #19 | 2026-10-29 | Roof detail drafts and the categorized details to-do (`7480d84`) |
| #20 | 2026-10-29 | `draft_AI_detail` skill, lessons log, AI tags on the roof drafts (`da35fa5`) |
| #21–#25 | 2026-10-29 | Round 3 quick detail, to-do, library header, boot cache, library hold and rename |
| #26–#28 | 2026-10-29 | Library GIFs, Hatch Collab swatches, `ai_collab` skill |
| #29–#30 | 2026-10-29 | Version log in Settings (v3 changes, v4 as current) |
| #32 | 2026-10-30 | Underlays under the pen; hatch draw order |

PR numbers are taken from the commit subjects on `main`. Some commits were squash-merged without a merge commit, so a number may be missing from the merge list.

### Rules that came out of the log

- **Reset a branch after its PR merges.** Do not add commits to a merged branch. Restart it from `origin/main` with the same name: `git checkout -B <branch> origin/main`. Then push with `--force-with-lease`. This is safe only because the old history is already merged.
- **Draft, then ready, then merge.** Open new PRs as drafts. Mark ready for review with the CCR route when the work is done. Merge only when the user asks.
- **Check mergeability before merging.** Read `mergeable` and `mergeable_state` first. Both were `clean` for #19 and #20.
- **Use REST when GraphQL is blocked.** `gh pr list` and similar calls fail in this sandbox with a GraphQL 403. Use `gh api repos/<owner>/<repo>/pulls...`.
- **Keep the to-do file honest.** Mark an item done only when its file exists. A first draft of the to-do marked two undrawn items as samples. They were corrected before the commit.
- **Commit messages carry no model name.** The session link stays. The model line in the attribution reminder is left out, because the system rules forbid model names in commits and PRs.
- **Subscribe to every PR you create.** Notifications come in as events; read them, act on any CI or review item, and stop once the PR is merged.

---

## 2. AI drafting (`draft_AI_detail`)

Process: `.claude/skills/draft_AI_detail/SKILL.md`. Each run adds one entry below.

### Entry template

```
### YYYY-MM-DD: detail name
- References used: ...   Rejected: ...
- Questions and answers: ...
- Assumptions: accepted ... / changed ... / rejected ...
- Variants: A ... B ... C ...   Chosen: ...   Changes in review: ...
- Next time: ...
```

### 2026-10-29: Roof drafts (first run, before the skill existed)

These five drafts were made before `draft_AI_detail` existed. They are tagged AI and carry `"ai_inferred": true`. No variants were drawn, and the user has not reviewed them.

- References used: `roof-1hr-rated.json` (roof/ceiling layers, hatch and note style), `floor-1hr-concrete-topping.json` (concrete and rigid layering), `window-sill-concrete-12in.json` (note and dimension style).
- Questions asked: none. Scope was taken from the request, so the assumptions below carry the risk.
- Assumptions made (open, for review): 3"=1'-0" scale; low-slope roofs with a 2 in. rigid insulation layer; 6 in. concrete deck or 3/4 in. plywood on joists as the structure; membrane terminations and flashing heights as typical, not from a manufacturer.
- Next time: ask the scope questions before drawing. The membrane, insulation, and flashing heights should be confirmed first.

### Lessons from drafting

- **Ask before drafting.** The first drafts assumed their scope. Stage 2 of the skill exists for this.
- **Tag every AI file.** Tags are `AI` and `draft`, plus `"ai_inferred": true` in the JSON. Human work stays untagged. An unknown origin is left untagged and reported as unknown.
- **Validate every spec.** Load it with `SK.authorDetail` in Node. A spec that throws is not done.
- **Export for review.** The app's JPEG export (150 dpi, with the title block) is the review image for Bluebeam. This session did not render images.

---

## 3. AI markup (`ai_collab`)

Process: `.claude/skills/ai_collab/SKILL.md`. These rules came from its design.

- **Back up before any write.** Save the current `items` and `tags` to a JSON file in the scratchpad, named by `local_id`. This is how the user undoes a change.
- **Number the name, not the tag.** The name gets the run number (`Hatch Collab 2`). The tag is `ai collab` for every run. It is not the `AI` tag, because a human drawing marked up with the AI keeps its human origin.
- **Prefix new ids.** Every item from a run starts `ai-collab-N-`, so a run can be found and removed as a set.
- **Never delete or move existing items** unless the scope asks for it, and then only after the backup.
- **Check each hatch draws.** Call `SK.hatchPrims` in Node for every new hatch. An empty result means the fill will not show.

---

## 4. Cloud library

Architecture Supabase project (`xabgankckrcuhcgdolrg`). Tables: `sketch_details`, `sketch_recordings`, `sketch_snapshots`, `table_index`.

### Review findings (2026-10-29)

- Six detail rows: 1 HR Wall with concrete floor (58 items, 13 recordings, 44 snapshots), Door jamb (15 items, 2 recordings, 10 snapshots), Roof Skylight (13 items, 2 recordings, 3 snapshots), Maze detail (1 item, 1 recording, 1 snapshot), and the 1 HR Roof and Floor examples (22 items each, no recordings).
- Maze detail looks like a stray test. It is kept until the user decides.
- The practice tables (`projects`, `intake_answers`, `proposals`, `fee_milestones`, `lessons_learned`) are empty.
- The review was read-only. Nothing in the database was changed.

### Rules

- Read the library before drafting, and never write to it from a drafting skill.
- Rows hold JSON, so a checked row can be trusted only after the spec that produced it is validated.

---

## 5. Tools and environment

- **GitHub MCP connector**: `plugin:github:github` failed with a 403 from the proxy in this session. Use the `gh api` REST routes instead.
- **Supabase**: the MCP tools read the cloud library in this sandbox. The upload path from the browser is still untested live (see `docs/checklist.md`).
- **Node tests**: run each file with `node tests/<name>.js`. All seven passed at the start of this session.
- **Scratchpad**: it was removed mid-session. Write backups and temporary files somewhere the session can still reach, and say where they went.

---

## 7. Practice and rating

How the owner works. It decides what the app should do, so read it before building a library feature.

- **Tags sort; they do not manage.** A tag puts a file in a group. Editing a tag never deletes the file it is on (decided 2026-10-31).
- **Local is an offline copy.** The cloud holds the active documents. This browser's copy exists so the work runs without a connection. Edits made here must reach the cloud too (decided 2026-10-31).
- **Start each drawing at one star.** The owner begins every piece with one star and something interesting in it. Stars go up only when a drawing earns them, so a higher rating means a stronger chance it is kept for later (decided 2026-10-31). The rating is 0 to 5 stars, and new details start at 1.
- **Hide what is not needed, but keep it one tap away.** Tags are tucked under More. Only the controls used every time stay in the header.

---

## 8. User interface

**Stale files hid the changes (31 Oct).** The owner reported that the grid and the grouped left bar were missing. Two causes, both invisible from the code:

- The stylesheet link still carried an old `?v=` string, so the browser kept the old CSS. Scripts had also been bumped only once, before later edits.
- Settings saved earlier carried `grid: false`, and saved settings are merged over the new defaults, so the new default never reached that browser.

Rules that came out of it:

1. Every change to a script or stylesheet bumps its `?v=` string, including the stylesheet link. Use one version string for the round and check every `src` and `href` before merging.
2. A new default that users must see needs a one-off migration for settings already saved (the grid uses `gridOn2`). A default in code alone does not reach a browser that has saved settings.
3. Say in the PR what the owner should see after a fresh load, and ask for a hard refresh if the old look persists.

**Check the real size before calling a layout done (31 Oct).** The left bar was checked at desktop size only. Measure it at phone size (390 px wide) and at a short height (460 px), where the overflow column takes over. Measure against the title block as well, which is taller than it looks (about 97 px with its margin).

**Measure, do not eyeball, alignment (31 Oct).** Centring was wrong until the groups filled the bar's width. Compare each tool's centre with its group's centre in the browser.

**Keep grid colours as shades of the background (31 Oct).** The owner's rule: no hue unless the background is coloured. Minor lines are 10 points from the background and major lines 25 points.

---

**Version 5 (31 Oct).** Decisions from the right-panel review:

- The clean screen (⤢) hides the title card as well as the toolbars.
- Playback is a right-panel item after Info (▶ in the rail). Replay runs in that panel; Log still offers Replay. Pausing or closing the panel keeps the replay; Done ends it.
- Info is compact: New at the top, the name edited in place, Export labels short, JSON folded away, Delete last.
- Settings text is short; Version and Changes fold away. v4 is kept at `history/v4/` and linked from Version.
- Ratings and the GIF button are on library cards, not in Info. The checklist said "info panel"; that is corrected.
- Screenshots of each version are in `history/screenshots/`.

Narrow screens (560 px and under, including iPhone): opening a side panel hides the left bar; closing the panel brings it back. The Log sheet does not hide it. Wide screens are unchanged.

---

## 9. Working lessons from the 31 Oct session

The whole session, from the left-bar rework to the grid, the phone layout and this log. Each rule is what the next run should start from.

**Asking and reading requests**

- When an example contradicts its own wording, restate the reading with concrete numbers and ask before building. Examples: "darker" gave a lighter example; "3 inches = 1 foot" was read three ways before the owner confirmed the grid square is one true inch.
- Check what already exists before asking. Export and print scale were already in the ⓘ panel, so no control moved. The "eye" button the owner named did not exist.
- Say in the final message which reading was built, so the owner can redirect.
- Stop and wait when the owner interrupts. Do not resume the interrupted action from memory.

**Merging and PRs**

- Merge only when the owner asks. Each merge request was explicit; other pushes were left as draft PRs.
- After an interrupted tool call, check the PR state (open, draft, merged) before retrying. A merge may have partly run.
- Mark a draft ready and merge only on the owner's ask; unsubscribe from PR activity once it is merged.
- Branch from the latest `origin/main`. When switching branches with uncommitted work, stash, switch, then pop.
- Commit and PR text carries no model identifier. The session trailer stays.

**Version log and caches**

- Keep the in-app version log current with each merge. It lagged PR #37 until the owner asked.
- Bump every `?v=` string (stylesheet and every script) on each change, including the stylesheet link. Stale strings hid the grouped bar.
- A new default does not reach a browser with saved settings. Migrate saved settings (`gridOn2`).

**Testing**

- Node tests cover pure logic, and that is where new maths belongs (`sketch/units.js`). Gridlines, shades and scale labels are all pure.
- Browser checks catch what node cannot: drag-to-pick, the hold menu, redo, Duplicate, the phone bar. Run them at the sizes the owner uses.
- Before calling a bug real, replay the exact sequence. A second tap on the open picker is meant to close it.
- Measure alignment and clearance in the browser. Eyeballing missed the off-centre tools and the overlap with the title block.

**Scale and grid**

- Keep the scale rule in one place. The sheet is in real inches; `factor` is real inches per printed inch; a minor square is one printed inch; every fifth line is major (5 in. × 5 in. printed).
- Screen-only overlays (the grid) stay out of the print and export paths.
- The grid colour is a shade of the background, never a hue, unless the background is coloured.

**Undo, redo and state**

- Every new change clears the redo stack. Scale changes are undoable too.
- Pickers and menus close on a second tap and on a tap outside. Test both.

**Phone and small screens**

- Check at 390 px wide and at a 460 px height. Tools stay at least 34 px and the mic and scene at 38 px.
- Measure the title block; it is taller than it looks (about 97 px with its margin).
