# Quick Detail — Project Schematic

Version 0.3. Drafted from a spoken planning conversation. Written so it reads well out loud. Section 12 records what the MVP build actually contains.

## 1. Vision

Quick Detail is a small, technology-agnostic editor for zoomed-in construction details: a parapet, a sill, a slab edge, a roof drain, a flashing termination.

It is not a mini Revit. It does not model a building. It draws one detail at a time, very precisely, and exports it as a clean sheet snip. You can drop that snip into a Bluebeam set as a PDF, paste it as a JPEG, or bring it into a larger CAD or Revit 2D detail package as a DXF, and later a DWG.

What sets it apart: **every line carries what it is, what it means, why it is there, and how it can fail.** The drawing doubles as a record of how an architect thinks. Over time, an AI that reads many of these details can learn those conventions, reuse them, and act as a second critical eye. It should catch the detail that looks off but is right, and the detail that looks right but is badly wrong.

## 2. Core Principles

- **Details only, for now.** Stay zoomed in. A larger file or library can grow out of this later.
- **Neutral geometry core.** The drawing lives in one plain JSON file that belongs to no BIM platform. Exports are views of that file. They are never the source of truth.
- **Black and white first.** Draftsmen think in pen weights, not colors. The MVP ships with a fixed, small pen set.
- **Graphics and meaning are separate.** How a line looks and what a line is are stored in different fields, so either can change without breaking the other.
- **Said versus guessed.** Anything the architect states is a fact. Anything the AI infers is labeled as an inference, with a confidence level, until a person confirms it. A guess never quietly becomes a fact.
- **Precision is the point.** Real units, real dimensions, real scale. No freehand pictures.
- **Claude can edit the same drawing.** Through an MCP interface, Claude works on the same geometry the architect sees. It proposes, previews, and validates before it commits.
- **Simple stack.** The editor is a self-contained HTML, CSS, and vanilla JavaScript page with no build step. The MCP bridge is a separate, small add-on.

## 3. What the MVP Draws

### Geometry

- Lines and polylines
- Rectangles and closed regions
- Arcs and circles
- Hatches, meaning filled regions with a pattern
- Text notes
- Leaders, meaning an arrow from a note to a line or region
- Linear dimensions
- Break lines and a detail title with scale

### Pen set

Five black pen weights and one gray screen. Every element uses exactly one.

| Pen | Name | Typical use |
|---|---|---|
| P1 | Extra fine | Hatch patterns, dimension lines, leaders |
| P2 | Fine | Secondary edges, fasteners, minor layers |
| P3 | Medium | Typical material edges in elevation |
| P4 | Heavy | Materials cut in section |
| P5 | Extra heavy | Primary cut profile, detail boundary, critical membrane emphasis |
| S1 | Screen | Gray. Existing construction, context, or work by others |

The exact millimeter values per pen are a setting, not hard-coded, so they can match an office standard.

### Units and scale

- Imperial and metric, chosen per detail.
- Geometry is stored in real-world units at full size. Scale is applied only on output.
- Common detail scales: 3 inches equals 1 foot, 1 and a half inches equals 1 foot, half full size, and full size.

## 4. The Detail File: Five Layers of Information

Each detail is one JSON file. Every element in it can carry up to five layers of information. Only the first layer is required to draw. The other four are what make the drawing intelligent.

1. **Representation.** How it is drawn: geometry, pen, hatch pattern, line type.
2. **Meaning.** What it is: waterproofing membrane, batt insulation, concrete slab, steel angle, sealant joint.
3. **Intent.** What the architect is trying to show: "membrane laps up the parapet a minimum of 8 inches," "this is the air barrier line."
4. **Construction logic.** Why it works: sequencing, which way water drains, which material laps over which, what must be continuous, what each piece depends on.
5. **Critical review.** How it can fail, and what a reviewer should check. Known risks, verified requirements, and open questions.

### Relationships

Elements also point to each other. Relationships are stored separately from the elements so that they are easy to query.

- **annotates**: this leader and note describe that membrane line.
- **laps over** and **laps under**: shingle order, so water runs off and not in.
- **continuous with**: the air barrier on the wall connects to the air barrier at the roof.
- **terminates at**: the membrane ends at this termination bar.
- **fastened to**: this angle is anchored to that slab.
- **bears on**: this sill sits on that blocking.

The leader relationship is key. When a note says "waterproofing" and its arrow touches a line, the file records which line that is. The AI no longer has to guess from proximity.

### Provenance

Every meaning, intent, logic statement, and relationship records where it came from:

- **source**: `architect`, `ai_inferred`, `library`, `imported`, or `rule` (a finding from the rule checks)
- **confidence**: `confirmed`, `high`, `medium`, or `low`
- **status**: `draft`, `reviewed`, or `locked`

Only a person can turn an AI inference into `confirmed`.

### Simplified example

```json
{
  "schema": "quickdetail.detail/0.2",
  "id": "parapet-membrane-01",
  "title": "Parapet at Low-Slope Roof",
  "units": "in",
  "scale": "3in = 1ft",
  "status": "draft",
  "elements": [
    {
      "id": "e12",
      "geometry": { "type": "polyline", "points": [[0, 0], [24, 0], [24, 10]] },
      "graphics": { "pen": "P5", "linetype": "continuous" },
      "meaning": {
        "material": "waterproofing_membrane",
        "role": "primary_water_barrier",
        "source": "architect",
        "confidence": "confirmed"
      },
      "intent": [
        { "text": "Membrane turns up parapet minimum 8 in above roof surface.", "source": "architect" }
      ],
      "logic": [
        { "text": "Must be continuous from field of roof to under the coping.", "source": "architect" },
        { "text": "Likely requires a cant or reinforcing strip at the inside corner.", "source": "ai_inferred", "confidence": "medium" }
      ]
    },
    {
      "id": "e20",
      "geometry": { "type": "region", "points": [[2, 12], [8, 12], [8, 30], [2, 30]] },
      "graphics": { "pen": "P1", "hatch": "batt_insulation_simple" },
      "meaning": { "material": "batt_insulation", "source": "architect", "confidence": "confirmed" }
    },
    {
      "id": "n3",
      "geometry": { "type": "text", "at": [30, 14] },
      "graphics": { "pen": "P1", "text": "WATERPROOFING MEMBRANE" }
    },
    {
      "id": "l3",
      "geometry": { "type": "leader", "points": [[29, 14], [24.2, 8]] },
      "graphics": { "pen": "P1", "arrow": "dot" }
    }
  ],
  "relationships": [
    { "type": "annotates", "from": "l3", "to": "e12", "note": "n3", "source": "architect" },
    { "type": "continuous_with", "from": "e12", "to": "e31", "source": "architect" }
  ],
  "review": [
    {
      "id": "r1",
      "check": "membrane_continuity",
      "subject": "e12",
      "result": "open_question",
      "text": "Membrane stops at top of parapet. Confirm it laps under coping and is not left exposed.",
      "source": "ai_inferred",
      "confidence": "medium"
    }
  ]
}
```

### Symbolic versus realistic rendering

A region can be drawn simply now and richly later. Batt insulation starts as a basic hatch. Once the system knows how the architect draws batt, the same region can render as the familiar squiggle without changing what it means. The meaning field stays fixed and only the representation changes.

## 5. The Detail Library

- A local folder of detail files, each self-contained.
- Searchable by material, assembly, condition, and tag. For example: "parapet," "window head," "below-grade waterproofing."
- **Typical locked details** are the gold standard. A locked detail has all five layers filled in and confirmed. It is the reference that new details are measured against, and the main thing the AI learns from.
- Details can be duplicated and adapted. The new copy keeps a link to the typical it came from, so changes can be traced.

## 6. Critical Review Engine

The review engine is the "second critical eye." It reads the meaning, logic, and relationships, not just the picture.

Examples of checks, growing over time:

- **Continuity.** Does the water barrier, air barrier, vapor retarder, and thermal layer each connect without gaps across the detail?
- **Lap direction.** Does every lap shed water outward and downward?
- **Termination.** Does every membrane end at a defined termination, and not in space?
- **Annotation coverage.** Does every major material have a note, and does every note point at a real element?
- **Consistency with the typical.** Where does this detail differ from the locked typical it came from, and is each difference intentional?
- **Dimension sanity.** Are lap lengths, clearances, and slopes within the stated requirements?

Every finding is labeled as one of the following:

- **Verified requirement**: tied to a stated rule or a locked typical.
- **Likely issue**: the AI's judgment, with a confidence level.
- **Open question**: the AI cannot tell, and asks.

The architect accepts, rejects, or answers each finding. Those answers become training signal for how this architect thinks.

## 7. MCP Interface for Claude

A small MCP server exposes the detail file to Claude Code. Planned tools:

- `open_detail` and `list_details`
- `get_elements`, with filters by meaning, pen, or region
- `propose_edit`: add, move, or restyle elements, returned as a preview diff and not applied yet
- `apply_edit`: commit a previewed change
- `annotate`: add a note and leader linked to a specific element
- `run_review`: run the critical review engine and return findings
- `export`: produce PDF, SVG, PNG, or DXF

Rules for Claude:

- Never overwrite architect-confirmed information without asking.
- Mark everything it adds as `ai_inferred` until confirmed.
- Validate the file against the schema before any edit is applied.

## 8. Exports

| Format | Purpose | Phase |
|---|---|---|
| SVG | Native vector preview, and the basis for the other exports | MVP |
| PDF | Bluebeam markup and print sets | MVP |
| PNG and JPEG | Quick paste into email, chat, and slides | MVP |
| DXF | Import into AutoCAD, Revit 2D detail views, and Rhino | MVP |
| DWG | Native AutoCAD delivery | Later |
| Rhino and Revit links | Direct push into a model's detail views | Long term |

Export rules:

- Pens map to lineweights in PDF and SVG, and to layers plus lineweights in DXF. For example, layer `QD-P4`.
- Meaning can travel as layer names or as extended data in DXF, so it is not lost downstream.
- Every export can include a title block strip with detail name, scale, and date.

## 9. Development Phases

1. **Draw and export.** Canvas, pen set, units and scale, geometry tools, hatches, notes, leaders, dimensions. Save and load JSON. Export SVG, PDF, PNG, and DXF.
2. **Meaning and relationships.** Tag elements with material and role. Snap leaders to elements to record what they annotate. Add intent and logic notes. Track provenance.
3. **MCP editing.** Claude reads and edits the same file, with preview and validation.
4. **Detail library.** Local, searchable library. Typical locked details. Duplicate and trace.
5. **Critical review.** Continuity, lap, termination, and annotation checks. Findings with clear labels. Accept, reject, or answer.
6. **Learning conventions.** Learn the architect's drawing habits and construction logic from the library. Suggest symbols, notes, and fixes. Render symbolic hatches as realistic graphics.
7. **Bigger picture.** DWG export, Rhino and Revit links, and assembling many details into a sheet or package.

## 10. Open Questions

- Which drafting standard should the pen weights and hatch patterns follow? For example, the US National CAD Standard or an office standard.
- Imperial only to start, or imperial and metric from day one?
- Which materials and roles go in the first controlled vocabulary? A starter list of about 30 common materials may be enough.
- Should construction logic be free text at first, or picked from a structured list of rules?
- What makes a detail "locked," and who can lock it?
- Should details link to real product data, such as a specific membrane manufacturer, or stay generic?

## 11. Long-Term Vision

A portable detail intelligence system. It still produces ordinary, usable drawings for any platform, and it remembers what every line means, why it is there, and how it could fail. Over time it learns to draw and review the way the architect does.

## 12. MVP Status (built)

The MVP covers phase 1 and phase 2, and the first rule checks from phase 5. It runs from `index.html` with no server and no build step. Drawings live in the browser and can be downloaded as JSON files.

### What works

- **Drawing.** Select, line, polyline, rectangle, region, circle, arc, text, leader, dimension, and break line. Endpoint and midpoint snapping, grid snapping, Shift for straight lines, and typed coordinates (`x,y`, `@dx,dy`, `length<angle`). Undo and redo, move, point editing, and a coordinates box for exact values.
- **Pens.** P1 to P5 and the S1 screen, with widths set in the settings gear. The screen shows true weights once zoomed in.
- **Hatches.** Diagonal, cross-hatch, steel, concrete, masonry, rigid and simple batt insulation, wood blocking X, earth, gravel, gray screen, and solid poché.
- **Meaning while drawing.** "Draw as" in the bottom bar tags every new element with a material and role, and sets that material's default pen and hatch.
- **Leaders know their target.** A leader whose tip lands on an element records an `annotates` relationship to it, and the note text defaults to that element's material.
- **Meaning panel.** Material, role, source, and confidence. Intent and construction-logic notes, each with provenance. AI-inferred items show a Confirm button.
- **Relationships panel.** Laps over, laps under, continuous with, terminates at, fastened to, bears on, and annotates. Pick the target by tapping it on the drawing.
- **Critical review.** Rule checks for file integrity, leaders that point at nothing, materials without a note, barriers with no recorded termination or continuity, unconfirmed inferences, and elements without meaning. Findings can be kept in the detail and marked open, accepted, rejected, or answered.
- **Detail settings.** Title, units (with conversion), scale, status, and tags. A locked detail is read-only.
- **Library.** Browser library with search by title, tag, or material. "Save as new copy" records the detail it came from.
- **Exports.** PDF (vector, Bluebeam-ready), SVG, PNG, JPEG, DXF (R12, full size, one layer per pen and material, such as `QD-P5-ROOFING_MEMBRANE`), and JSON. Each export includes a title strip.

### Known limits

- DXF leaves out gray-screen and poché fills; their outlines still export. Lineweights travel as layer colors (P1 = 1 red through P5 = 5 blue, S1 = 8 gray), the way a CAD plot style table maps color to pen.
- The library lives in this browser's storage only. Download JSON to keep a file.
- Text widths use Helvetica metrics, so centered and right-aligned text can shift slightly in other fonts.
- No MCP bridge yet. `QD.app` exposes state, `load`, `mutate`, and `exportAs` for it to build on.

### File structure

- `index.html`: page shell. Top bar, toolbar, drawing stage, bottom bar, stacked panels, settings gear, errors.
- `style.css`: pastel interface around a white drawing sheet. One column on narrow screens.
- `js/vocab.js`: pens, linetypes, scales, hatches, materials, roles, sources, and relationship types.
- `js/geom.js`: distances, polygons, hatch clipping, Helvetica text widths, and feet-and-inch formatting.
- `js/model.js`: new detail, ids, validation, normalizing, and point access.
- `js/primitives.js`: elements to drawing primitives in real units. Every output is drawn from these.
- `js/svg.js`: primitives to SVG, for the screen and the SVG export.
- `js/export.js`: PDF writer, R12 DXF writer, PNG and JPEG, and download.
- `js/review.js`: rule checks for the critical review.
- `js/sample.js`: sample detail, a parapet at a low-slope roof.
- `js/app.js`: editor. State, tools, snapping, panels, library, settings, keyboard.
- `tests/smoke.js`: Node check of the core and exports. Run `node tests/smoke.js`.
- `index_summary.html`: visual map of the code and its tunable variables.
- `todo.md`: next steps.
