---
"@cloudflare/vite-plugin": minor
"wrangler": minor
"@cloudflare/deploy-helpers": patch
---

Write Build Output to `.cloudflare/output/v1/` and record the producer

`vite build` and the experimental `wrangler build --experimental-cf-build-output` now write Build Output v1, with account settings nested under `settings` in the root `config.json`. They also record themselves as the `producer`, so readers can name the tool that wrote the output in error messages. Previews from Build Output read the account settings from their new location.
