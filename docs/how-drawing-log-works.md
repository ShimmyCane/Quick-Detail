# How the drawing log works

The logic the drawing log follows, written so it still applies after the code is split up. Decided points are stated as rules. Open points are marked **Open**.

## What the log is

The log is the history of one detail as a branch tree. It is not a list of audio files. Each recording (take) is a sequence of edits. Each scene is a step in that sequence. A branch is a new line that starts from a step of another line.

## Lanes

- A **lane** is the main line or one branch of it.
- The **main line** is lane `0`. It is always first and never moves.
- Each branch is shown as its own lane, stacked vertically under its parent, the way audio and video tracks stack in an editor.
- A lane can be **collapsed** to its header or **opened** to show its steps. Collapsing hides steps only. It never deletes anything.
- A branch joins its parent with a connector drawn at the step it forked from.

## Addresses

Labels are computed from the tree. They are never stored, so they stay correct after a delete.

- The first branch off a step has no letter: `4`.
- Later branches off the same step take B, C, … in creation order: `4B`, `4C`.
- A branch off step 6 of lane `4B` is `4B.6`. A second one there is `4B.6B`.
- Steps are counted **per lane**, from 1, across all of that lane's recordings. A branch does not inherit the parent's count.
- A path reads as a walk. `4B.6.2.4` means: main line steps 1–4, then lane B steps 1–6, then the sub-branch steps 1–2, then the next lane steps 1–4. The sequence is those ranges joined in order.
- A branch made before fork points were recorded shows `?`. It is not guessed.

## The step row

Each step shows:

- its number in the lane
- its time
- the first words of what was said (from speech)
- its actions: **▶ Clip**, **Replay**, **Restore**, **Branch**

**Restore** puts the sheet back to the end of the step. **Branch** starts a new lane from that step. Both are undoable.

## Descriptions

- The transcribed speech is kept exactly as recorded.
- Anything you add later is a **separate note** on the step, with a timestamp. It never replaces the speech.

## Stills

- A still is kept only at each **fork point** and at the **last step of each lane**. Intermediate steps have no still.
- A branch's end card and its fork point are what the genealogy view reads.

## Deleting

- Deletion is **by frame**. Deleting a step removes it from its lane.
- Any branch that forked from the deleted step is **promoted** to fork from the step before it, so nothing is left hanging.
- A fork left with one branch draws as a single line.
- Labels are recomputed after a delete. If `4B` is deleted and `4C` remains, `4C` becomes `4B`.
- There is **no recycle bin** for steps or branches. Deletes are undone from the detailed log's **undo**.
- Deleting a step changes every later state in its lane, so the stills after it must be re-rendered. This needs the recording events. A file that has only stills can delete whole branches only.

## Saving back

- Working copies are local. Nothing reaches the cloud until you press **save back to cloud**.
- Each genealogical edit saved to the cloud is a new version of the card: `v1`, `v2`, `v3`. An earlier version is never overwritten.
- If the cloud has moved on since the file was exported, the save asks before it replaces anything.

## Detailed history

- A **Detailed History** button sits in the upper-right corner of the right panel.
- It opens the **viewer**, a separate tab. The viewer is one template page that loads any detail's bundle, the way the library opens a detail.
- The viewer shows the lane tree, the stills, and the descriptions. It has its own **undo** for edits made there.
- The viewer can be taken offline as one HTML file, with the bundle embedded.
  - Opened from the local browser: the file has the events, so steps can replay line by line.
  - Opened from the cloud: the file has only the stills, so each step shows its still.

## Off the canvas

- The genealogy is shown in the viewer, not on the sheet. It is never saved into the detail's items and never prints.

## Open

- **Canvas overlay.** Showing the genealogy on the infinite canvas as a toggle that never prints was discussed and is not decided. The viewer covers the same need now.
- **Cloud fork column.** The fork point is not stored in Supabase yet. It needs a column before a cloud round trip keeps it.
- **Orphaned lanes.** A lane whose parent is missing currently labels as `0`. Promotion on delete should prevent this.
- **Letters after delete.** Relabelling on delete is decided. Whether an open viewer should re-label live while you're in it is not.

## Where the code is

- `sketch/lanes.js`: steps, addresses, version labels. Pure, with tests in `tests/lanes.js`.
- `sketch/app.js`: the log, branch and restore actions, the right panel.
- `sketch/core.js`: replay and scene splitting.
