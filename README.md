# Quick Detail

A sketching app for construction details: an endless sheet in real inches, pen strokes, notes with arrows, dimensions, hatches, image and block underlays, scenes recorded as you draw and talk, a library, and a cloud copy in Supabase. Plain HTML, CSS and JavaScript, with no build step.

**Open `index.html`** in a browser. It works from a file or from any static host.

## Where things are

| Path | What |
|---|---|
| `index.html` | The page, and the load order of every script and stylesheet |
| `sketch/*.js` | Pure logic (also runs in Node) and browser services: painting, storage, microphone, live file, cloud |
| `sketch/app/*.js` | The app, in 23 parts that share one global scope. `base.js` loads first, `start.js` last |
| `sketch/css/*.css` | The stylesheet, in seven files that load in order |
| `tests/*.js` | Tests: `node tests/<name>.js` |
| `tools/codemap.js` | Builds the code map |
| `docs/` | Decisions, the to-do list, lessons learned, the hatch reference, example detail specs |
| `history/` | Archived versions (v1, v2, v4) and screenshots |

**Code map:** [`docs/code-map/index.html`](docs/code-map/index.html) shows how a drawing flows through the code, what each file does, and where every function lives. Each file has its own page. The latest review and its open questions are in [`docs/code-map/review.html`](docs/code-map/review.html).

## Before you push a change

1. Run every test: `for f in tests/*.js; do node "$f" || break; done`. `tests/browser-smoke.js` needs Playwright and skips itself without it.
2. Bump the `?v=` value on every `src` and `href` in `index.html` (one value for all of them).
3. Add a line to `sketch/app/changelog.js` for anything a user would notice.
4. Refresh the code map: `node tools/codemap.js`.
