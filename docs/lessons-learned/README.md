# Lessons learned

What we decided while drafting and marking up details, and why. Read the relevant folder before drawing, and add to it after a run that taught something.

## Folders

Each folder covers one kind of knowledge. Add a new folder when a new kind of knowledge appears, and give it a README that says what belongs there.

| Folder | What goes here |
|---|---|
| `hatch/` | Material hatch patterns: how each is defined in the app, how the user draws it by hand, and why we chose it. One file per pattern, such as `earth.md`. |
| `drafting/` | Drafting technique: line weights, scale, labelling habits, how we run draft and markup skills. `ai-detail-runs.md` is the run log for `draft_AI_detail`. |
| `building/` | Building practice behind a detail: how a wall, roof or slab is built and why it is detailed that way. |
| `logic/` | Reasoning rules the drawings follow, such as ordering of layers, drainage, and where a detail starts and stops. |
| `manufacturers/` | Product specifics from named manufacturers: model, limits, and the source it came from. Each file names its source and date. |
| `details/` | Notes on specific details: the scope agreed, the assumptions, and what the user changed in review. |
| `conditions/` | Site and exposure conditions: climate zone, frost depth, wind, moisture, and the condition each detail assumes. |

## File conventions

- Start each file with one line saying what it covers.
- Record the source of every fact: the user's drawing, the app code (with file and line), a code book, or a manufacturer's sheet. Mark facts with no source as `assumed`.
- Keep the newest decision at the top of a section and note the date.
- Do not write a rule as a code requirement. These are drawing conventions and team decisions, and the "verify before use" rule in `docs/details-todo.md` still applies.
