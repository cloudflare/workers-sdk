---
"create-cloudflare": patch
---

Fix SvelteKit project creation failing with "Error parsing file: svelte.config.js"

As of `sv` 0.16, newly scaffolded SvelteKit projects no longer include a `svelte.config.js` file, and the adapter is configured in the Vite config instead. C3 now updates the adapter import in `vite.config.ts`/`vite.config.js` rather than `svelte.config.js`, so creating a SvelteKit project succeeds again.
