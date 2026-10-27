# Wall sketch: to-do

Checked boxes are done. Newest decisions are at the top of their section.

## Decide

- [x] **Where the details live.** Applied to the Architecture project: `sketch_details`, `sketch_recordings`, `sketch_snapshots`, the private `sketch-media` bucket, and `table_index`, which says which project claims each table. Record: `docs/supabase-sketch.sql`.
- [x] Access is owner-only, the same rule the practice tables use. Checked in the database: the owner's email can write, another email is refused.
- [ ] **Sign-in setup (you).** Uploads use an emailed sign-in link. In Supabase → Authentication → URL configuration, set the Site URL and add the page's address to the redirect URLs, and make sure the email provider is on. Without this the link has nowhere to return to.
- [ ] Link details to the existing `projects` table (`project_id` exists but is not set yet). Decide per detail which practice project it belongs to.

## Test on real hardware

- [ ] Upload a detail from a browser that has internet: Project info → Upload to cloud. Then Library → Cloud → open it and play the audio. The sandbox could not reach the Supabase library, so the upload path is untested live.

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

- [x] 2026-10-27 Cloud sync: upload a detail with its recordings, audio, scene JPEGs and metadata (`sketch/cloud.js`). Re-uploading updates the same rows.
- [x] 2026-10-27 Library: a Cloud view signs in, lists what was uploaded, plays the audio and shows the scene pictures, and shows the table index. Search, delete from browser, and the Quick Detail look.

- [x] 2026-10-27 Endless sheet, scenes, notes, dimensions, library (v3, PR #2).
- [x] 2026-10-27 Element tags from geometry and from the words said while drawing (`sketch/analyze.js`).
- [x] 2026-10-27 Library page: sort, filter by tag, hold a card to flip through its scenes.
- [x] 2026-10-27 JPEG exports carry their metadata in the file, with a `.metadata.json` beside them. Scene series gives each scene its own.
- [x] 2026-10-27 Checked the Architecture Supabase project: it holds practice tables only, and they are empty. No sketch tables exist yet.
