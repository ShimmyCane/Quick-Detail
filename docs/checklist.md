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

## Blocks

A block is a finished detail placed inside another detail. It is a live link, so editing the source updates every block that uses it. Items under **Decide** are for you to review and revise. The default in each one is what the AI builds unless you change it.

### Decide (you)

- [ ] **Live link.** A block points at a finished detail and always shows its latest drawing. Default: live. Option: pin a block to a saved version (a Save checkpoint) instead.
- [ ] **What comes in.** Default: lines, notes, dimensions and hatches come in. Tag chips, recordings, scenes and the log stay with the source. Note text is kept. Tell me if "note tags" meant something else.
- [ ] **Scale.** Default: a block takes the host's scale. If the source was drawn at another scale, the block shows a small "scale differs" label.
- [ ] **Nesting.** Default: a block can hold blocks, up to 5 levels deep. A detail that already contains the host is refused, so nothing can loop.
- [ ] **Pop-up.** Default: editing a detail that blocks use shows "Used in N blocks: <host names>" with three buttons: Keep editing (changes all of them), Branch as new version, Cancel. Shown once each time that detail is opened.
- [ ] **Branch as new version.** Default: copies the source to a new detail, leaves the original untouched, and repoints only the host you were editing from. Other hosts keep the original. This is a separate link (`versionOf`), not the existing Branch, which records `parentId` and can be merged back. A merge must never change the original, so the two stay apart.
- [ ] **Missing source.** Default: a dashed placeholder reading "Source deleted", with a "Copy in" button that turns the block into plain items.
- [ ] **Parallel JSON.** Default: a block is stored as a reference (source id and position). Its lines are not copied into the spec.

### Built (branch `claude/quick-detail-blocks`, to review)

- [x] Pure logic in `sketch/blocks.js`: flatten blocks into drawable items at their offset, find hosts of a source, guard against loops and nesting deeper than 5. Node tests in `tests/blocks.js`.
- [x] New item kind `block`: `{ id, kind: 'block', sourceId, at: [dx, dy] }` in `detail.items`. Existing details are unaffected.
- [x] Add a block: Project info → Blocks → pick a finished detail. It lands at the centre of the view, with tags and recordings left out.
- [x] Draw the expanded lines and notes at the block's offset. Exports, library pictures and the log use the same expansion.
- [x] Move a block as one unit: once selected, drag anywhere on it. Undo covers the move.
- [x] Underlay (round 2): a block draws faint under the linework, like an image underlay. Its chips set opacity (20–100%), scale (50–300%, and a corner handle that keeps the top-left fixed) and Print (default: left out). The erase tool skips underlays, so remove them with Delete. The U toggle hides them.
- [x] Library (round 2): tapping a card shows a summary with Open to edit, Duplicate and Import as block. Editing is never opened by a tap on the card.
- [x] Block details (round 2): a detail named `Block_…` (or tagged `block`) appears as a checkbox in the Blocks checklist of Project info. Ticking adds it as an underlay and selects it; unticking removes it.
- [x] Pop-up when a detail that blocks use is opened: Keep editing, Branch as new version, and Back to the detail I came from (when opened from a block).
- [x] Branch as new version: a new detail with a `versionOf` link. The original stays as it is, and only the block you came from is pointed at the new version.
- [x] Missing source: a dashed box labelled "Block: source not on this device". Its chips are hidden, so use Delete to remove it.
- [x] Copy in: replaces a block with plain copies of its lines, with new ids.
- [x] Library card: "Used in N blocks".
- [x] Parallel JSON: a `block` entry with `sourceId` and `at`. Lines are not copied.

### Not built yet, or changed from the defaults above

- [ ] **Scale differs label.** Not built. A block takes the host's text size, but its line weights come from the source's scale.
- [ ] **Cloud sources.** Blocks resolve against this browser's details only. A cloud-opened host whose source was not downloaded here shows the missing-source box.
- [ ] **Cloud row for `versionOf`.** Not stored in Supabase, so a version loses its link when it goes to the cloud. No schema change was made.
- [ ] **Recordings on a branch.** The new version starts with no recordings. The original keeps its own.
- [ ] **Parallel JSON source name.** The block entry carries `sourceId` only, not the source's name.
- [ ] **Tests for the cloud case and the pop-up.** `tests/cloud.js` has no block case. The pop-up and branch flow were checked in a headless browser, not in a test file.

### Test on real hardware (you)

- [ ] Drag a block with the pen, then with a finger, on the iPad. Buttons in the pop-up should be large enough for a fingertip.
- [ ] Edit a source used in two blocks. Check the pop-up lists both hosts, and that both update.
- [ ] Branch as new version, then edit the new one. The original and the other host must not change.

## Underlays and draw order

- [x] Drawing tools go over a selected image or block. Only the arrow tool picks up, scales or turns an underlay, and a tap with a drawing tool no longer selects one. Covered by `tests/blocks.js` and a headless Chromium check of the pen over a block's line.
- [x] Hatch draw order: Bring to front, Move forward, Move back and Send to back, in the hatch's chips. A button is off when its move changes nothing. Undo works.
- [x] Underlays always paint under the linework, so they have no order of their own. Send to back is their default and cannot be changed.

### Test on real hardware (you)

- [ ] On the iPad, add a block, then draw across it with the pen. It must draw and not move. Then pick the arrow and drag it.

## Releasing

- [ ] Every local file in `index.html` ends in `?v=...`. Change that value whenever any file in `sketch/` changes, so a browser or host that caches files cannot mix an old script with a new page (that mix gave a blank sheet and a dead library on 2026-10-29).
- [ ] The Supabase library still loads from a public CDN. Bundle a copy in `sketch/` so the cloud library works when the CDN is slow or blocked. It could not be downloaded from the build sandbox, so it needs to be added from a machine with open internet.

## Library

Decided 31 Oct: tags are a way of sorting the files, not of managing them. Editing a tag never deletes a detail.

- [x] **Edit Tags page.** Built 31 Oct: An Edit Tags button in the upper right of the library opens a page for editing tags across the whole library. Each tag is a panel. Tap a tag and small thumbnails of the details in it appear beside it.
  - **Delete tag.** Removes that tag from every detail that has it. The files stay. The warning lists how many details lose the tag. Deleting details is a separate, manual step.
  - **Replace tag.** Tap a second tag, and the first shows red and the chosen tag green. A pop-up asks "Replace tag A with tag B?" with Confirm. Confirming applies it everywhere, then returns to the first panel. If a detail already has the target tag, it merges and does not duplicate.
  - **Undo** button at the top. Session only: it reverts the tag edits made since the page was opened and clears when the page closes.
  - **Applies to both** the cloud and this browser. The cloud is the master copy; this browser's copy is an offline sync of the active documents.
  - **Element tags become a list, not tags.** Built 31 Oct: library tag filters show typed tags only. Tags that come from tagged elements (speech and geometry) move to their own list on this page. Each entry can be edited or removed here. Removing one tells the AI the user does not care about that item, so it is ignored in the future.
- [x] **Sort, recycle bin and search in the header.** Built 31 Oct: the sort (⇅) and + menus, a smaller search, the recycle bin and Edit tags buttons. Sort stays under the header, and the recycle bin moves up there too. The search box gets smaller. A `+` and a sort symbol replace the wide controls. The sort menu offers Last edited, Created, Rating, Name and Most scenes.
- [x] **Tag row back under More.** Built 31 Oct, under the + menu. You liked the tags hidden under More, so they go back there. The All chip stays the default. (The Sort control stays in the header.)
- [x] **Rating, 0 to 5 stars.** Built 31 Oct: tap a star in the info panel; sort by rating. Stored in the cloud row's metadata, so no column was needed. A basic star rating on every detail. New details start at 1 star. Sort by rating in the library. Higher stars mean the detail is more likely to be kept for future work.
- [x] **Cloud recycle bin.** Approved and built 31 Oct. Cloud delete moves a detail to the bin (`sketch_details.deleted_at`, added to the Architecture project). The bin lists under Library → Recycle bin when signed in, with Restore, Delete for good and Empty cloud bin. Delete for good removes its media and recordings. The local copy is never touched.

## Later

- [ ] **Main and nightly pages.** When the app grows, run two versions: a stable main page, and a nightly build for trying new work. Plan (about a month out): the nightly page deploys from its own branch with its own `?v=` cache values, so the two never mix files. Test data goes to a Supabase branch, not the real library, so test deletes and tag edits never touch real details.
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
