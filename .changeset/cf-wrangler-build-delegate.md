---
"wrangler": minor
---

Add `cf-wrangler build` delegate support

The experimental `cf-wrangler` delegate binary now accepts `build` and emits the Build Output API directory through Wrangler's new-config build path. This lets parent tools invoke Wrangler's build-output implementation with `cf-wrangler build` instead of shelling out through the public Wrangler CLI.
