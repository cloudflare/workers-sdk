---
"wrangler": patch
---

Generate SvelteKit types before the first autoconfig build

Wrangler now prepends `wrangler types` to the one-time build it runs after configuring SvelteKit projects that have a TypeScript or JavaScript type config. This prevents `wrangler types --check` scripts inserted by `sv add` from failing because `worker-configuration.d.ts` has not been generated yet.
