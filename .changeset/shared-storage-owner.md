---
"miniflare": minor
---

Add experimental `unsafeSharedStorageOwner` option to share local storage across processes

When several Miniflare instances run with resources with the same resource ID, they will now share the underlying data.
