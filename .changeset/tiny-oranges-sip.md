---
"wrangler": minor
---

Add `bindingOverrides` and `getExport()` to `createTestHarness()`

Test harness workers loaded from Wrangler config files can now replace a configured binding with a Worker in the same harness. This is useful for replacing platform bindings with test Workers while keeping the source Worker config production-like. Worker handles also expose `getExport()` for calling JSRPC methods on the default Worker export, including mock Workers used as override targets.

```ts
const server = createTestHarness({
	workers: [
		{
			configPath: "./workers/app/wrangler.jsonc",
			bindingOverrides: { AI: "mock-ai" },
		},
		{
			config: {
				name: "mock-ai",
				main: "./workers/mock-ai.ts",
				compatibility_date: "2026-06-18",
			},
		},
	],
});

const mockAi = await server
	.getWorker<Env, typeof import("./workers/mock-ai")>("mock-ai")
	.getExport();
```
