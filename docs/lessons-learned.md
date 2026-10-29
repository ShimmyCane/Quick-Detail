# Lessons learned: AI-drafted details

One entry per run of the `draft_AI_detail` skill (`.claude/skills/draft_AI_detail/SKILL.md`). Newest at the top. Keep each entry short. Record what the user chose and why, so the next run starts from it.

## Entry template

```
## YYYY-MM-DD: detail name
- References used: ...   Rejected: ...
- Questions and answers: ...
- Assumptions: accepted ... / changed ... / rejected ...
- Variants: A ... B ... C ...   Chosen: ...   Changes in review: ...
- Next time: ...
```

## Entries

### 2026-10-29: Roof drafts (first run before the skill existed)

These five drafts were made before `draft_AI_detail` existed. They are tagged AI and carry `"ai_inferred": true`. No variants were drawn, and the user has not reviewed them.

- References used: `roof-1hr-rated.json` (roof/ceiling layers, hatch and note style), `floor-1hr-concrete-topping.json` (concrete and rigid layering), `window-sill-concrete-12in.json` (note and dimension style).
- Questions asked: none. Scope was taken from the request, so the assumptions below carry the risk.
- Assumptions made (open, for review): 3"=1'-0" scale; low-slope roofs with a 2 in. rigid insulation layer; 6 in. concrete deck or 3/4 in. plywood on joists as the structure; membrane terminations and flashing heights as typical, not from a manufacturer.
- Next time: ask the scope questions before drawing. Those drafts assumed too much, and the membrane, insulation, and flashing heights should be confirmed first.
