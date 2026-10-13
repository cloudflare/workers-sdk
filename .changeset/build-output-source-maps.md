---
"wrangler": minor
---

Include source maps by default in `wrangler build --experimental-cf-build-output`

Build Output now matches `wrangler deploy` and `wrangler versions upload`, which upload source maps by default, so Workers built for tools like `cf` get stack traces that point at the original source. Source maps that can't be resolved are skipped rather than failing the build. Set `upload_source_maps = false` to opt out.
