---
"wrangler": patch
---

Fix Pages Functions routing to prioritize index routes over catch-all wildcards

Previously, when both an `index.ts` and a `[[fallback]].ts` existed in the same directory, requests to `/` would incorrectly be handled by the catch-all route instead of the index route. This was because the routing algorithm sorted routes by segment count, causing the catch-all (1 segment) to be evaluated before the index route (0 segments).

The index route now correctly takes precedence over catch-all wildcards at the root level.
