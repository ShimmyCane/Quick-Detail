# Details: to-do

The library of details to draw, by category. Each item is a drawing spec: a JSON file in `docs/examples/`, built with `sketch/author.js`.

Status: `[x]` drawn as a draft spec. `[ ]` not started. Every draft says "verify before use" on its drawing: a draft is a starting point, not a released detail.

Scale for all: 3"=1'-0" unless the item says otherwise.

## Wall details

- [ ] 1 hr rated wood-framed wall (listed design to confirm)
- [ ] Exterior wall at grade: foundation to slab, sill and sill seal
- [ ] Wall to floor junction, wood-framed
- [ ] Wall to roof junction, wood-framed (plate and rafter bearing)
- [ ] Masonry veneer with air gap, flashing and weep at base
- [ ] Interior partition to exterior wall, corner
- [x] Control joint in CMU wall: `control-joint-cmu.json` (AI draft, in the cloud library as `ai-control-joint-cmu`)
- [ ] Shaft wall, 1 hr

## Roofing details

- [x] Roof edge at CMU parapet, membrane terminated: `roof-edge-cmu-parapet.json`
- [x] Roof drain in concrete deck, clamping ring and strainer: `roof-drain-concrete-deck.json`
- [x] Wood roof curb on low-slope deck, membrane up and over: `roof-curb-wood-framed.json`
- [x] Roof expansion joint, two concrete decks, metal cover: `roof-expansion-joint.json`
- [x] Roof base flashing at CMU wall, counterflashing: `roof-base-flashing-cmu.json`
- [x] 1 hr rated roof/ceiling assembly: `roof-1hr-rated.json` (earlier sample)
- [ ] Eave at sloped wood roof with ventilated soffit (needs a sloped drawing)
- [x] Ridge vent at sloped roof: `ridge-vent-sloped-roof.json` (AI draft, in the cloud library as `ai-ridge-vent-sloped-roof`)
- [ ] Step flashing at a sloped roof meeting a wall
- [x] Gutter at eave, with drip edge: `gutter-eave-drip-edge.json` (AI draft, in the cloud library as `ai-gutter-eave-drip-edge`)
- [x] Overflow scupper through parapet: `scupper-through-parapet.json` (AI draft, in the cloud library as `ai-scupper-through-parapet`)

## Door details

- [ ] Exterior door head, wood-framed (flashing over head)
- [x] Exterior door sill on concrete, with threshold and sill pan: `door-sill-concrete-threshold.json` (AI draft, in the cloud library as `ai-door-sill-concrete-threshold`)
- [x] Door jamb, wood frame: `Door jamb` (in the cloud library, drawn freehand; not yet a spec)
- [ ] Door in 1 hr wall: fire-rated frame and head
- [ ] Door at slab-on-grade, threshold to finish floor

## Window details

- [x] Interior window sill, 12in concrete wall: `window-sill-concrete-12in.json`
- [x] Window head, wood-framed, with lintel and flashing: `window-head-wood-framed.json` (AI draft, in the cloud library as `ai-window-head-wood-framed`)
- [x] Window jamb, wood-framed, to insulated wall: `window-jamb-wood-insulated.json` (AI draft, in the cloud library as `ai-window-jamb-wood-insulated`)
- [x] Window sill, wood-framed wall, exterior with sill pan: `window-sill-wood-framed-sill-pan.json` (AI draft, in the cloud library as `ai-window-sill-wood-framed-sill-pan`)
- [ ] Skylight curb, sloped roof (see Roofing)

## Floor and ceiling details

- [x] 1 hr floor/ceiling with concrete topping: `floor-1hr-concrete-topping.json`
- [ ] Floor to exterior wall, wood-framed, with insulation
- [ ] Ceiling at exterior wall, insulated attic (cold roof)

## Foundation and slab details

- [x] Slab on grade edge with frost protection: `slab-edge-frost-protection.json` (AI draft, in the cloud library as `ai-slab-edge-frost-protection`)
- [ ] Footing to wall, cast-in-place
- [ ] Waterproofing and drainage at below-grade wall

## Fire-rated and specialty (added)

- [x] Penetration of 1 hr wall by pipe, sealed with listed firestop: `pipe-penetration-1hr-wall-firestop.json` (AI draft, in the cloud library as `ai-pipe-penetration-1hr-wall-firestop`)
- [ ] Shaft wall at roof (roof-side closure)

## Ideas for review (added in round 3)

Things to decide and review before the drafts are trusted. Nothing here is built yet.

- [ ] Review each AI draft as keep, revise, or discard, and record the choice next to it. Drafts are starting points, not released details.
- [ ] Practice mode: draw the detail first from the title and the to-do note, then compare with the AI draft and list what it got right or missed.
- [ ] AI check on my drawing: ask for missing dimensions, unlabelled materials, layer or weight mismatches, and notes that disagree with the drawing. Show the answer as suggestions on the sheet, never as edits.
- [ ] Settle the drafting standard first: line weights, hatch patterns, note wording, and when a dimension is required.
- [ ] Code and listing references in notes are a risk. Require a listing or code section number for every fire, wind or frost claim before a draft leaves the tool.
- [ ] Build a "what is this detail for" card (where it sits, what it must do) so the AI check has the context it needs.

## Infrastructure (added)

- [ ] Extend what a detail can hold in Supabase. Some hatch detail rows now carry 250 to 270 items, and a save has failed in the app for a large detail. Find the real limit (row size, payload, or the app's save path). Store large details as files, for example in Supabase Storage, with the row holding a pointer, so a detail can carry many more objects without a large row.

## Notes for review

- Each drawing carries a "verify before use" note. Before a detail leaves this tool, check it against the listed assembly (UL, GA or manufacturer data) and the local code.
- Start the next round with the roofing drafts above, so we can settle the drafting standard before the rest are drawn.
- Add items freely. Categories can be split later.
