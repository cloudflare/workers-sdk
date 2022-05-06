---
"wrangler": patch
---

fix: support preview buckets for r2 bindings

Allows wrangler2 to perform preview & dev sessions with a different bucket than the published worker's binding.

This matches kv's preview_id behavior, and brings the wrangler2 implementation in sync with wrangler1.
