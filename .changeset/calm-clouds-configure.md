---
"@cloudflare/autoconfig": minor
"@cloudflare/config": minor
"@cloudflare/vite-plugin": minor
"@cloudflare/vitest-plugin": minor
"wrangler": minor
---

Define experimental Cloudflare configuration with a single default export

Experimental `cloudflare.config.ts` files now define settings and resources together in a default-exported `defineConfig()` call. Add a Worker under `worker`, add Containers to the `containers` array, or omit both to provide settings only.

```ts
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	accountId: "...",
	complianceRegion: "public",
	worker: {
		name: "my-worker",
		compatibilityDate: "2026-09-18",
		entrypoint,
	},
});
```
