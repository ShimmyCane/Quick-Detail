---
name: import_library_image
description: Open a Detail Library copy in Quick Detail with its picture as the background. Finds the cloud copy by name, checks it holds an image, and returns the link that opens it in Quick Detail (index.html#import=<id>). Read only. Use when the user says "import_library_image [name or id]".
---

# import_library_image

A Detail Library item (an image, SVG or PDF) is copied to the cloud library as a Quick Detail sheet whose only item is the picture. This skill opens that copy in Quick Detail with the picture as the background: an underlay that paints under the drawing and never prints.

The same thing happens when the Detail Library's "Open in Quick Detail" button is used. This skill is for asking in chat.

## Invocation

`import_library_image [name or id]`

- **Name or id**: the cloud row's `name` (case-insensitive, partial match is fine), or its `local_id` if it starts with `dl-`. If more than one row matches, list them and ask which one.

## Where it lives

- Supabase project `xabgankckrcuhcgdolrg` (Architecture), table `public.sketch_details`.
- Copies from the Detail Library have `metadata->>'source' = 'detail-library'`.

## Steps

1. **Find the copy.** Read only:
   `select local_id, name, scale, jsonb_array_length(items) as items, items->0->>'kind' as first_kind, metadata->>'source' as source from public.sketch_details where deleted_at is null and name ilike '%<name>%';`
   Use `metadata->>'source' = 'detail-library'` to narrow it when the user asks for a Detail Library item.
2. **Check it.** The first item must be `image`. If it is not, say so and stop. Do not change anything.
3. **Return the link.** The Quick Detail address is the one set in the Detail Library (`quickDetailUrl` in `library-cloud.js`). Give it as `<quickDetailUrl>#import=<local_id>`. If the address is not set, say that and give the `local_id`.
4. **Report.** Name, `local_id`, the link, and what opens: the sheet, with the picture as a no-print background. Remind the user that they must be signed in to the owner account in Quick Detail, which uses its own sign-in on its own page.

## What is not done here

- No writes. The skill does not change rows, items or tags.
- No cloud sign-in. Quick Detail asks for it when the link opens.
- Copies that were not made by the Detail Library open as they are. Their image is not forced to be a background.
