---
"@cloudflare/vitest-pool-workers": minor
---

Feat: Support specifying an environment for your worker when running tests. This allows your tests to pick up bindings & variables that are scoped to specific environments.

For example:

```ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				wrangler: {
					configPath: "./wrangler.toml",
					environment: "production",
				},
			},
		},
	},
});
```
