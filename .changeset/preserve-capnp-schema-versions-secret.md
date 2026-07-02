---
"wrangler": patch
---

Preserve the capnp schema when updating secrets via `wrangler versions secret put/delete/bulk`

These commands re-upload the latest version's content with the new secrets applied. Previously the compiled capnp schema attached to the version was dropped, producing a new version without it. The schema is now carried through from the existing version's content to the new version upload.
