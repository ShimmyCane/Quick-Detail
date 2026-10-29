---
name: ai_collab
description: Collaborate with the user on an existing cloud detail. Reviews a detail the user names, then adds hatch fills and labels either directly on its drawing or to the side of it, tags it "ai collab", and numbers the detail name on each run (Hatch Collab 1, Hatch Collab 2, ...). Use when the user says "ai_collab [detail name] [scopes] [markup or side]".
---

# ai_collab

The user draws, the AI marks up. Use this on a detail that already exists in the cloud library. The drawing stays the user's work: the AI adds hatches and labels, and changes nothing else unless the scope asks for it.

## Invocation

`ai_collab [detail name] [scopes to tweak] [direct markup or add to side]`

- **Detail name**: the cloud row's `name`, matched case-insensitively. If more than one row matches, list them and ask which one.
- **Scopes to tweak**: what to change. Examples: `hatches` (fill the closed shapes with material patterns), `labels` (name the materials), `notes`, `dimensions`. If the user gives none, review only and report. Do not guess a scope.
- **Direct markup or add to side**:
  - `markup`: add items on top of the existing drawing, inside its closed shapes. Hatch fills need a closed region, so check the outline first.
  - `side`: add a labelled swatch column to the right of everything, clear of notes. This is the default when the user does not say.

If the user omits the mode, use `side` and say so in the report.

## Where the detail lives

- Supabase project `xabgankckrcuhcgdolrg` (Architecture), table `public.sketch_details`. Columns: `local_id`, `name`, `tags text[]`, `items jsonb`, `updated_at`.
- Read with `execute_sql`: `select local_id, name, tags, jsonb_array_length(items) from public.sketch_details where name ilike '%<name>%';`
- This skill only writes to `sketch_details`. Never write to the other tables, and never to `table_index`.

## Item formats

Items are JSON objects in `items`. Coordinates are real inches, y down, at 3"=1'-0" unless the detail's `scale` says otherwise.

- Stroke: `{"c":"ink","id":"...","kind":"stroke","w":0.08,"t0":0,"pts":[[x,y,pressure,ms],...]}`
- Note: `{"c":"ink","id":"...","kind":"note","at":[x,y],"size":0.09375,"text":"...","width":2.6,"height":null,"justify":"auto","leaders":[]}`
- Hatch: `{"c":"ink","id":"...","kind":"hatch","pattern":"<key>","pts":[[x,y],...],"outline":true}`

Hatch pattern keys come from `sketch/hatch.js` (`SK.HATCHES`): `wood1`, `wood2`, `plywood`, `gypsum`, `insulation`, `batt`, `rigid`, `brick`, `cmu`, `concrete`, `gravel`, `earth`, `screen`, `steel`. Do not use `none`, which is a placeholder for no fill. Check that any key you write exists in that file first.

A key is not always the right drawing. When the user's own marks for a material differ from the key, draw the user's convention as strokes and say so in the report. Earth is the first case: the key `earth` is ±30° lines, but the user draws grouped horizontal and vertical dashes. See `docs/lessons-learned/hatch/earth.md`.

## Lessons learned

Decisions and their reasons live in `docs/lessons-learned/`. Read the file for the pattern in scope before planning marks, and add to it after each run that settled something. The folder index is `docs/lessons-learned/README.md`.

## Steps

1. **Read the detail.** Fetch its row. Summarise what is there: strokes, notes, what the notes say, its tags, and its extent (min and max x and y of the points). Note anything that looks like an accident, such as a single-point stroke, and report it. Do not delete it.
2. **Back up.** Before any write, save the current `items` and `tags` to a JSON file in the scratchpad. Name it with the `local_id`. This is how the user undoes the change. If `items` is too large to copy in one read (about 50 KB or more), record the item count, the tags, and the id list instead, and undo by removing the run's id prefix. Say which one you used.
3. **Plan the marks.**
   - `side`: start the column at x = (max x of existing items and notes) + 2 in. Pick a clear region: two columns of 2 in × 1 in swatches, 1.5 in row pitch, a note 0.3 in above each swatch with its label, and a heading note above the block.
   - `markup`: for each closed shape, use its points as the hatch `pts` and set `outline: true`. Shapes that are not closed get a note and no fill.
   - Read the user's own marks for the material with the point data, not just the picture. Measure the lengths, angles and spacing, then draw from those numbers. Name what you read in the report.
   - Check every mark sits inside its outline with a margin. Compute this in Node before writing.
4. **Check the marks draw.** In Node, load `sketch/core.js`, `sketch/units.js` and `sketch/hatch.js`, then call `SK.hatchPrims({kind:'hatch', pattern:k, pts:p, outline:true}, 1)` for each new hatch. Every one must return fills. Fix any that come back empty.
   - Render the result before writing. Draw the items to an SVG with Chromium (`/opt/pw-browsers/chromium`, `--no-sandbox`), save a PNG to the scratchpad, and look at it. Send it to the user with `SendUserFile` when the user asks to see it, or when they will judge the options.
5. **Number the run.** Find the run number N from the name. If the name ends in a number, such as `Hatch Collab 1`, N is that number plus one. If it does not, the name is the base, such as `Hatch Collab`, and N is 1.
6. **Write.** Use one `update` that appends the new items (`items || '[...]'::jsonb`), sets the name to the base name plus ` N`, and adds the tag `ai collab` if it is missing. Do not rewrite existing items unless the scope asks for it. Set `updated_at = now()` so the app sees the newer copy.
   - Write large sets in batches of about two options per `execute_sql` call. The first call removes any earlier items with this run's id prefix, so a rerun does not duplicate them. The last call sets the name.
   - Before writing, compute a checksum in Node for each block: point count, sum of x and sum of y. After writing, compute the same from the database for those ids. The two must match. Transcribing items into SQL by hand has introduced no errors so far, but check it every time.
   ```sql
   update public.sketch_details
   set items = items || '[...]'::jsonb,
       name = '<base name> N',
       tags = case when 'ai collab' = any(tags) then tags else array_append(tags, 'ai collab') end,
       updated_at = now()
   where local_id = '<local_id>'
   returning name, tags, jsonb_array_length(items) as n_items;
   ```
7. **Verify.** Re-read the row and confirm the item count went up by the number written, the name ends in ` N`, and the tags include `ai collab`. Run the checksum comparison from step 6.
8. **Report.** Give the user the item count, what was added and where, the review notes from step 1, the backup path, and what you read from the user's marks. Say that a copy of the detail already open on this device will be replaced only when the user agrees in the app.
9. **Log the lesson.** If the run settled a pattern choice, a convention, or a reason, add it to the matching file in `docs/lessons-learned/` (for hatches, `hatch/<pattern>.md`). Record the user's choice and reason when they give one, and mark anything unsourced as `assumed`.

## Rules

- Every item this skill adds has an `id` that starts `ai-collab-N-`, where N is the run number, so each run can be found and removed as a set. The Hatch Collab run was the first; its ids have no number and stay as they are.
- Tag is `ai collab`. It marks collaborative work. The number goes on the detail name, not the tag. It is not the `AI` tag from `draft_AI_detail`: that tag is for drafts the AI produced, and a human drawing marked up with the AI keeps its human origin.
- Never delete or move existing items unless the scope says so, and then only after the backup in step 2.
- Never claim a detail is code-compliant or that a hatch matches a listed assembly. The hatch is a drawing convention, not a specification. The "verify before use" rule from `docs/details-todo.md` still applies.
- The user's sketch is the reference for how a material looks, not the app key. Run 3 drew the app's ±30° earth swatch when the user had drawn orthogonal dashes, and had to be redone. Read the sketch first.
- Keep the wording of options plain and the names consistent: option letters (A, B, C), then a sub-letter for variants of an option (C1A to C1F). The ids carry the same letters.
- Commit only when the user asks. Cloud writes happen when the user asks for them in the invocation.
