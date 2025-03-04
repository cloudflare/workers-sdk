---
"wrangler": minor
---

feat: prompt users to rerun `wrangler types` during `wrangler dev`

If a generated types file is found at the default output location of `wrangler types` (`worker-configuration.d.ts`), remind users to rerun `wrangler types` if it looks like they're out of date.
