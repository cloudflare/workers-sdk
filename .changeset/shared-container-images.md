---
"@cloudflare/containers-shared": patch
"wrangler": patch
---

Improve Container image listing and deletion

List all image pages using read-only credentials, validate tags before deletion, and report successful deletion when the garbage-collection request fails.
