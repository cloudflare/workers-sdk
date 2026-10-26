---
"@cloudflare/vite-plugin": patch
---

Fix a dev server failing to start when an earlier dev server in the same process had different Worker exports

The Vite plugin now clears the Worker export types it detected when a dev server closes. A dev server created afterwards in the same process derives them from its own config again, so it no longer fails with `Class extends value undefined` for a Durable Object the earlier server's Worker did not export.
