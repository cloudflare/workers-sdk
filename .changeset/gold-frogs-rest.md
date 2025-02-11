---
"@cloudflare/vitest-pool-workers": patch
---

Added [Vite dependency pre-bundling](https://vite.dev/guide/dep-pre-bundling) support. If you encounter module resolution issues—such as: `Error: Cannot use require() to import an ES Module` or `Error: No such module`—you can now bundle these dependencies using the [deps.optimizer](https://vitest.dev/config/#deps-optimizer) option:

```tsx
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
	test: {
		deps: {
			optimizer: {
				ssr: {
					enabled: true,
					include: ["your-package-name"],
				},
			},
		},
		poolOptions: {
			workers: {
				// ...
			},
		},
	},
});
```

Fixed #6591, #6581, #6405.
