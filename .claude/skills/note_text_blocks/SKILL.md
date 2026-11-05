---
name: note_text_blocks
description: Lay out note text as readable blocks, 4 to 10 words a line, with a size hierarchy for titles, callouts and labels. Checks every note with tools/note-blocks.js and fixes its width. Use whenever the AI writes or edits notes on a detail or drawing, and before any render is shown for review.
---

# note_text_blocks

Notes are read as blocks of several rows, not as long lines with only a few rows. This applies to every note the AI writes: callouts, view titles, and draft warnings.

## Rules

1. **4 to 10 words a line, aiming for about 7.** A note of 4 to 10 words may sit on one line. A longer note wraps into a block. Every line but the last has 4 to 10 words, and the last line is not a single orphan word.
2. **Labels are exempt.** A note of fewer than 4 words (a grid bubble, `N`, `A`, "Entry (assumed)") stays on one line.
3. **Width follows the words, not the space available.** Set a note's width from its text size so that it wraps at about 7 words. Never widen a note to fill an empty part of the sheet.
4. **Size hierarchy.** On large drawings (a building at 1/4"=1'-0"), these multiples of the paper text size read well:

   | Class | Scale | Used for |
   |---|---|---|
   | title | 6× | the title under each view |
   | note | 4× | callouts with a leader |
   | small | 3.5× | levels, grid bubbles, section and north letters |
   | dim | 3.5× | dimension text |

   At detail scales (3"=1'-0" and up) the paper size is usually right. Record the multiples in the spec as `text_scale`, and the class of each note as `text_class`.
5. **Room for blocks.** A block is taller than a line. Leave about 4 rows of title text below each view, and a row of callouts above it. Check that neighbouring views' titles do not meet.
6. **Leaders stay short and do not cross other text.** Put a callout beside what it names, and keep callouts in one row along a facade, not stacked over each other.
7. **Watch the special cases.** In a mirrored view (for example a north elevation with east on the left), labels go outward from the building. Levels closer together than one text row (Grade and 1st floor) take their labels on opposite sides of the line.

## Steps

1. Write the notes with widths from rule 3. A starting point: width ≈ 7 words × 6 characters × 0.6 × text height, in real inches at the drawing's scale.
2. Run the check:
   `node tools/note-blocks.js docs/examples/<spec>.json`
   For each note that breaks the rules, it prints the words on each line and a width that fixes it.
3. Apply the suggested widths. Shorten or split any note the tool cannot fit.
4. Render the drawing and look at it. Check that no text overlaps linework or other text, as well as the word counts.
5. Run `node tools/note-blocks.js --strict ...` last. It exits 1 if any note is still out of range.

## Rules for the AI

- Do not show a render for review before step 5 passes, unless you say which notes are still out of range.
- Keep the user's wording. Fix the width first; reword only when no width fits.
