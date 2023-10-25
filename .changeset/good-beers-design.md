---
"wrangler": patch
---

chore: bump `miniflare` to [`3.20231025.0`](https://github.com/cloudflare/miniflare/releases/tag/v3.20231025.0)

This change enables Node-like `console.log()`ing in local mode. Objects with
lots of properties, and instances of internal classes like `Request`, `Headers`,
`ReadableStream`, etc will now be logged with much more detail.
