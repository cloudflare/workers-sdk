---
"wrangler": patch
---

Prevent delete-only `wrangler secret bulk` input from creating a new Worker

Previously, `wrangler secret bulk` could create a draft Worker when the input only deleted secrets and the target Worker name did not exist. Delete-only bulk secret operations now leave Worker-not-found as an error instead of creating a new Worker.
