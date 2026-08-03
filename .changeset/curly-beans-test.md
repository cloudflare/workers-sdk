---
"wrangler": minor
---

Allow Wrangler projects to build a Worker once and reuse it in `createTestHarness()`

Build the Worker once:

```sh
wrangler deploy --dry-run --outdir ./worker-output
```

Then reuse the emitted Worker during test harness startup and reset:

```ts
const server = createTestHarness({
	workers: [
		{
			configPath: "./wrangler.jsonc",
			outDir: "./worker-output",
		},
	],
});
```
