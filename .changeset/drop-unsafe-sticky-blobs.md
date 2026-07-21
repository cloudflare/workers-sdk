---
"miniflare": major
---

Drop the `unsafeStickyBlobs` option

This prevented blob files from being deleted when overwriting or deleting keys, and only existed to support the Durable Object isolated storage feature in `@cloudflare/vitest-pool-workers`, which was removed in 0.13.0. Blobs are now always cleaned up as expected.
