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
- [ ] Control joint in CMU wall
- [ ] Shaft wall, 1 hr

## Roofing details

- [x] Roof edge at CMU parapet, membrane terminated: `roof-edge-cmu-parapet.json`
- [x] Roof drain in concrete deck, clamping ring and strainer: `roof-drain-concrete-deck.json`
- [x] Wood roof curb on low-slope deck, membrane up and over: `roof-curb-wood-framed.json`
- [x] Roof expansion joint, two concrete decks, metal cover: `roof-expansion-joint.json`
- [x] Roof base flashing at CMU wall, counterflashing: `roof-base-flashing-cmu.json`
- [x] 1 hr rated roof/ceiling assembly: `roof-1hr-rated.json` (earlier sample)
- [ ] Eave at sloped wood roof with ventilated soffit (needs a sloped drawing)
- [ ] Ridge vent at sloped roof
- [ ] Step flashing at a sloped roof meeting a wall
- [ ] Gutter at eave, with drip edge
- [ ] Overflow scupper through parapet

## Door details

- [ ] Exterior door head, wood-framed (flashing over head)
- [ ] Exterior door sill on concrete, with threshold and sill pan
- [x] Door jamb, wood frame: `Door jamb` (in the cloud library, drawn freehand; not yet a spec)
- [ ] Door in 1 hr wall: fire-rated frame and head
- [ ] Door at slab-on-grade, threshold to finish floor

## Window details

- [x] Interior window sill, 12in concrete wall: `window-sill-concrete-12in.json`
- [ ] Window head, wood-framed, with lintel and flashing
- [ ] Window jamb, wood-framed, to insulated wall
- [ ] Window sill, wood-framed wall, exterior with sill pan
- [ ] Skylight curb, sloped roof (see Roofing)

## Floor and ceiling details

- [x] 1 hr floor/ceiling with concrete topping: `floor-1hr-concrete-topping.json`
- [ ] Floor to exterior wall, wood-framed, with insulation
- [ ] Ceiling at exterior wall, insulated attic (cold roof)

## Foundation and slab details

- [ ] Slab on grade edge with frost protection
- [ ] Footing to wall, cast-in-place
- [ ] Waterproofing and drainage at below-grade wall

## Fire-rated and specialty (added)

- [ ] Penetration of 1 hr wall by pipe, sealed with listed firestop
- [ ] Shaft wall at roof (roof-side closure)

## Notes for review

- Each drawing carries a "verify before use" note. Before a detail leaves this tool, check it against the listed assembly (UL, GA or manufacturer data) and the local code.
- Start the next round with the roofing drafts above, so we can settle the drafting standard before the rest are drawn.
- Add items freely. Categories can be split later.
