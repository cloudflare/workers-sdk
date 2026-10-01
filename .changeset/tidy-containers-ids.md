---
"wrangler": patch
---

Accept Durable Object application IDs in Containers commands

`wrangler containers instances` and `wrangler containers delete` now accept the 32-character hexadecimal application IDs returned for Durable Object-backed applications, in addition to legacy dashed UUIDs.
