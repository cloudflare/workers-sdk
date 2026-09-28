---
"@cloudflare/vite-plugin": minor
"wrangler": minor
---

Use `cf/config` for `cloudflare.config.ts` authoring

Experimental `cloudflare.config.ts` projects must now import `defineConfig`, bindings, triggers, and related helpers from `cf/config`. Generated declarations from Wrangler and the Vite plugin also reference this package, so projects using the experimental configuration flow must add `cf` as a dependency.

The Vite plugin no longer exports `@cloudflare/vite-plugin/experimental-config`. `wrangler/experimental-config` remains available for `defineWranglerConfig`, but no longer re-exports Cloudflare configuration helpers.
