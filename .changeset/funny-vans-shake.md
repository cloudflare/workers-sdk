---
"@cloudflare/vite-plugin": minor
---

Provide the resolved entry Worker config in the second parameter to the auxiliary Worker `config` function. This makes it straightforward to inherit configuration from the entry Worker in auxiliary Workers.

Example:

```ts
export default defineConfig({
	plugins: [
		cloudflare({
			auxiliaryWorkers: [
				{
					config: (_, { entryWorkerConfig }) => ({
						name: "auxiliary-worker",
						main: "./src/auxiliary-worker.ts",
						// Inherit compatibility settings from entry Worker
						compatibility_date: entryWorkerConfig.compatibility_date,
						compatibility_flags: entryWorkerConfig.compatibility_flags,
					}),
				},
			],
		}),
	],
});
```
