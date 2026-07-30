---
"miniflare": major
"@cloudflare/workers-utils": minor
---

Move `formatZodError` from `miniflare` to `@cloudflare/workers-utils`

The `formatZodError` and `_forceColour` helpers are no longer exported from `miniflare`; they are now exported from `@cloudflare/workers-utils`. Update any imports accordingly.
