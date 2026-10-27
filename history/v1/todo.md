# Quick Detail — To Do

Work through these one at a time. Move done items to the bottom with a date.

## Next
- [ ] Try the MVP on the iPad and a laptop. Note what feels slow or awkward when drawing a real detail.
- [ ] Answer the open questions in schematic.md section 10: drafting standard, imperial or metric, starter material list, free-text or structured logic, what "locked" means.
- [ ] Offset tool: draw a parallel line at a set distance, for membranes and board layers.
- [ ] Trim and extend, or at least split a line at a point.
- [ ] Snap to the nearest point on a line, and to intersections.
- [ ] Gray-screen and poché fills in DXF (as SOLID triangles).
- [ ] Optional DXF that keeps meaning as extended data, not only in layer names.

## Phase 3: Claude through MCP
- [ ] Small MCP server that reads and writes detail JSON files in a folder.
- [ ] Tools: open_detail, list_details, get_elements, propose_edit, apply_edit, annotate, run_review, export.
- [ ] Validate with `QD.M.validate` before every apply. Mark Claude's additions `ai_inferred`.

## Phase 4 and later
- [ ] File-based library folder alongside browser storage.
- [ ] More rule checks: lap direction (sheds water), termination at a defined element, comparison with the locked typical.
- [ ] Realistic batt insulation squiggle rendering from the same meaning.

## Done
- [x] 2026-10-23 Schematic v0.2.
- [x] 2026-10-23 MVP: drawing tools, pens, hatches, meaning, relationships, rule checks, library, PDF/SVG/PNG/JPEG/DXF/JSON exports.
