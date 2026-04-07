---
"miniflare": patch
---

Update Images binding local mock to use chainable handle pattern

`hosted.image(imageId)` now returns a handle with `details()`, `bytes()`, `update()`, and `delete()` methods, aligning with the updated workerd API (https://github.com/cloudflare/workerd/pull/6288).
