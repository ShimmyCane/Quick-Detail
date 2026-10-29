---
name: ai_collab
description: Collaborate with the user on an existing cloud detail. Reviews a detail the user names, then adds hatch fills and labels either directly on its drawing or to the side of it, and tags it "ai collab". Use when the user says "ai_collab [detail name] [scopes] [markup or side]".
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

## Steps

1. **Read the detail.** Fetch its row. Summarise what is there: strokes, notes, what the notes say, its tags, and its extent (min and max x and y of the points). Note anything that looks like an accident, such as a single-point stroke, and report it. Do not delete it.
2. **Back up.** Before any write, save the current `items` and `tags` to a JSON file in the scratchpad. Name it with the `local_id`. This is how the user undoes the change.
3. **Plan the marks.**
   - `side`: start the column at x = (max x of existing items and notes) + 2 in. Pick a clear region: two columns of 2 in × 1 in swatches, 1.5 in row pitch, a note 0.3 in above each swatch with its label, and a heading note above the block.
   - `markup`: for each closed shape, use its points as the hatch `pts` and set `outline: true`. Shapes that are not closed get a note and no fill.
4. **Check the marks draw.** In Node, load `sketch/core.js`, `sketch/units.js` and `sketch/hatch.js`, then call `SK.hatchPrims({kind:'hatch', pattern:k, pts:p, outline:true}, 1)` for each new hatch. Every one must return fills. Fix any that come back empty.
5. **Write.** Use one `update` that appends new items (`items || '[...]'::jsonb`) and adds the tag. Do not rewrite existing items unless the scope asks for it. Set `updated_at = now()` so the app sees the newer copy.
   ```sql
   update public.sketch_details
   set items = items || '[...]'::jsonb,
       tags = case when 'ai collab' = any(tags) then tags else array_append(tags, 'ai collab') end,
       updated_at = now()
   where local_id = '<local_id>'
   returning name, tags, jsonb_array_length(items) as n_items;
   ```
6. **Verify.** Re-read the row and confirm the item count went up by the number written, and the tags include `ai collab`.
7. **Report.** Give the user the item count, what was added and where, the review notes from step 1, and the backup path. Say that a copy of the detail already open on this device will be replaced only when the user agrees in the app.

## Rules

- Every item this skill adds has an `id` that starts `ai-collab-`, so the user can find and remove the whole set.
- Tag is `ai collab`. It marks collaborative work. It is not the `AI` tag from `draft_AI_detail`: that tag is for drafts the AI produced, and a human drawing marked up with the AI keeps its human origin.
- Never delete or move existing items unless the scope says so, and then only after the backup in step 2.
- Never claim a detail is code-compliant or that a hatch matches a listed assembly. The hatch is a drawing convention, not a specification. The "verify before use" rule from `docs/details-todo.md` still applies.
- Commit only when the user asks. Cloud writes happen when the user asks for them in the invocation.
