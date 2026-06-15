---
"@cloudflare/vite-plugin": minor
---

Add `experimental.newConfig.cfBuildOutput` option to support future deployments via the `cf` CLI

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	plugins: [
		cloudflare({
			experimental: {
				newConfig: {
					cfBuildOutput: true,
				},
			},
		}),
	],
});
```
