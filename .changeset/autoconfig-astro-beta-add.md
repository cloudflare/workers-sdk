---
"@cloudflare/autoconfig": patch
---

Fix Astro projects set up for cf getting a `wrangler.jsonc` instead of a `cloudflare.config.ts`

Autoconfig installed `astro@beta` to get the `astro add` that writes `cloudflare.config.ts`, but package managers such as pnpm kept the project's newer stable Astro, whose `astro add` writes `wrangler.jsonc`, so the build failed. Autoconfig now runs the beta's `astro add` once without installing it, and keeps the project's Astro version.
