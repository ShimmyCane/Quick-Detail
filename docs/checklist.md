# Wall sketch: to-do

Checked boxes are done. Newest decisions are at the top of their section.

## Decide

- [ ] **Where the details live.** Today they are in this browser only (IndexedDB, database `wallsketch`). Clearing site data or using another device loses them. Options:
  - [ ] Put them in the Supabase **Architecture** project (`xabgankckrcuhcgdolrg`). Draft tables: `docs/supabase-sketch.sql`. It is not applied. Say yes and I will apply it and wire up sync.
  - [ ] Keep them local and export JSON as the backup for now.
- [ ] Link details to the existing `projects` table (optional `project_id`), or keep them standalone?
- [ ] Are the `sketch-audio` bucket and the policies in the draft right for how you sign in?

## Test on real hardware

- [ ] Speech to text in Chrome and on the iPad (Safari uses a different recogniser). Speech only reaches the page when the browser supports it.
- [ ] Replayed sound lines up with the picture. Chrome-recorded WebM files often cannot seek, so check a scrub to the middle of a long scene.
- [ ] Pen and finger on the iPad: pen draws, fingers pan once a pen is used, pinch zooms.
- [ ] Hold a library card to flip through its scenes on a touchscreen.
- [ ] Open an exported JPEG in a PDF or CAD viewer. The metadata is in a JPEG comment, which some apps strip. The `.metadata.json` beside it is the reliable copy.

## Tagging

- [ ] Review the construction word list in `sketch/analyze.js` (`SK.VOCAB`). Add your firm's terms.
- [ ] Spoken words attach to the element drawn closest in time, within 6 seconds (`SPEECH_REACH_MS`). Check a few scenes and tune the window if words land on the wrong element.
- [ ] Shape reading (spec 002, section 7) is not built. Lines and closed shapes are tagged from their geometry only.

## Later

- [ ] "Rebuild database" command: find untagged details, read their drawings and scenes, and write tags back. This runs on the JSON export today.
- [ ] Tags on individual log cards (deferred on your request).
- [ ] Link the library with another repository.
- [ ] Import v2 drawings into v3 (v2 stays readable from Settings → Version log).

## Done

- [x] 2026-10-27 Endless sheet, scenes, notes, dimensions, library (v3, PR #2).
- [x] 2026-10-27 Element tags from geometry and from the words said while drawing (`sketch/analyze.js`).
- [x] 2026-10-27 Library page: sort, filter by tag, hold a card to flip through its scenes.
- [x] 2026-10-27 JPEG exports carry their metadata in the file, with a `.metadata.json` beside them. Scene series gives each scene its own.
- [x] 2026-10-27 Checked the Architecture Supabase project: it holds practice tables only, and they are empty. No sketch tables exist yet.
