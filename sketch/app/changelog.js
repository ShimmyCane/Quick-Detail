// Quick Detail app — Version list and change log.
// Data only, shown in Settings → Version and Settings → Changes. Add a line to CHANGES with each change a user would notice,
// and keep the top VERSIONS entry current. Archived versions link to their copy under history/.
// Part of the app split across sketch/app/*.js. The parts share the page's global scope, so load order matters:
// see the <script> list in index.html and docs/code-map/index.html.
'use strict';

var VERSIONS = [
  { label: 'v5 · current', href: null, text: 'Playback in the right panel, compact Info, clean screen hides the title' },
  { label: 'v4 · archived', href: 'history/v4/index.html', text: 'The app before v5, kept as it was' },
  { label: 'v3', href: null, text: 'Endless sheet, scenes, notes, dimensions, library' },
  { label: 'v2 · Wall sketch', href: 'history/v2/index.html', text: 'Blank sheet with recording and replay' },
  { label: 'v1 · Quick Detail', href: 'history/v1/index.html', text: 'Detail editor with tools, meaning and exports' }
];

// Changes, newest first: [date, what changed].
var CHANGES = [
  ['31 Oct', 'Recycle bin question: Cancel has the focus for the local bin too, as it already had for the cloud bin'],
  ['31 Oct', 'Code tidy: the app and its styles are split into smaller files; nothing changes on screen'],
  ['31 Oct', 'v5: clean screen also hides the title card'],
  ['31 Oct', 'Replay opens in the right panel from the Log; the ▶ rail button is archived'],
  ['31 Oct', 'Info: New at the top, the name is edited in place, JSON under its own fold'],
  ['31 Oct', 'Settings: shorter text; the version list links the archived v4'],
  ['31 Oct', 'Dimension: a left-bar picker with icons for orthographic, aligned and angular; the mode chips left the hint bar'],
  ['31 Oct', 'Scale change keeps note boxes and dimension offsets the same size on paper; one undo step'],
  ['31 Oct', 'Graphic scale: whole increments only (1", 2", 3", 6", then feet); the bar is its true length at this zoom, so its right edge moves as you zoom'],
  ['31 Oct', 'Left bar is one panel with dividers; the microphone sits on its own row above the scene button'],
  ['31 Oct', 'Small screens: tools that do not fit on the left bar move to a second column behind a + button'],
  ['31 Oct', 'Left bar tools are centred on the bar\'s centre line'],
  ['31 Oct', 'Undo: hold it to open Redo on the right, drag onto it and let go; Ctrl+Shift+Z and Ctrl+Y also redo'],
  ['31 Oct', 'Element pop-up: Duplicate, and layer order (front, forward, back, send to back) for every drawable element'],
  ['31 Oct', 'Colour and line weight: one dot each; tap or drag along the row to choose; the choice is remembered'],
  ['31 Oct', 'Reference grid on the sheet, on by default, screen only and never in exports: one true inch a square, shades of the background; every fifth line is major'],
  ['31 Oct', 'Left bar starts from the lower left corner, above the title block, and grows upwards'],
  ['31 Oct', 'Phone: a narrower left bar, with tools still easy to tap'],
  ['31 Oct', 'Graphic scale bar keeps a fixed length; its label changes from inches to feet as you zoom'],
  ['31 Oct', 'Reference grid follows the scale: a square is one printed inch and the major lines print at 5 in. x 5 in. at any scale'],
  ['31 Oct', 'Library: All and the sort are visible by default; one list sorted by last edited (or created); edited and created dates on every card'],
  ['31 Oct', 'Library cards: a compact catalogue (picture, title, one line that follows the sort). Tap a card for its info: click the picture to play the GIF, click the title to rename, × closes, and Open, Insert as block, Duplicate, PNG and GIF'],
  ['31 Oct', 'Library header: Library and Back on the first row; Local, Cloud, Recycle bin, search, sort and + on the second. Edit tags is at the top of +, above a scrollable tag list'],
  ['31 Oct', 'Edit tags page: tags as panels with thumbnails; delete and replace a tag with a confirm; element tags as their own list; undo lasts for the page'],
  ['31 Oct', 'Ratings: 0 to 5 stars on each detail, new details start at 1, and the library sorts by rating'],
  ['31 Oct', 'Library header: sort (⇅) and + menus, recycle bin and Edit tags buttons; tags are back under + and element tags are no longer tags'],
  ['31 Oct', 'Cloud recycle bin: × on each cloud card moves it to the bin, where it can be restored or deleted for good. The local copy stays'],
  ['29 Oct', 'GIF button in a detail\'s info panel, for local and cloud details: an animated GIF of its recordings'],
  ['29 Oct', 'Library: hold a card to preview it; Rename in the info panel; clearer buttons'],
  ['29 Oct', 'Starts with a visible message if the sheet fails to load (for example a stale cached script)'],
  ['29 Oct', 'Library header: Back at the top, tags under More, New detail removed'],
  ['29 Oct', 'Cloud library options, zoom to extents, 6 in. start view'],
  ['29 Oct', 'Recording, select tool, recycle bin, names, ten starter details'],
  ['29 Oct', 'Blocks: insert one detail into another as a block; branch a block as a new version'],
  ['29 Oct', 'Cloud library works like the local one; cloud details open on this device'],
  ['29 Oct', 'Images as underlays, hidden by hand; library background switch'],
  ['29 Oct', 'Roof and floor details as drawing specs'],
  ['29 Oct', 'A JSON file of each detail, with its takes, kept on disk and uploaded with cloud saves'],
  ['29 Oct', 'Library: filter by several tags at once'],
  ['29 Oct', 'Undo on the left rail; scale bar holds two grid ticks; details can be drawn from JSON'],
  ['28 Oct', 'Library: hold-to-flip on the loaded detail only'],
  ['28 Oct', 'Hatch patterns follow section conventions; tighter left rail'],
  ['28 Oct', 'Eraser, hatch patterns, yellow pen, zoom limits; no page zoom on iPad'],
  ['27 Oct', 'Cloud collections, drawing-view background and grid, pen colours and weights'],
  ['27 Oct', 'Password sign-in and password reset in the cloud sign-in form'],
  ['27 Oct', 'Cloud sync to the Architecture project; library review'],
  ['27 Oct', 'Elements tagged from speech and geometry; library page; metadata in exports']
];
