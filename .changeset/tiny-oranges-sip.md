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
			bindingOverrides: { BROWSER: "mock-browser" },
		},
		{
			// A mock Worker implementing the Browser Rendering binding named "mock-browser".
			configPath: "./workers/mock-browser/wrangler.jsonc",
		},
	],
});

const mockBrowser = await server
	.getWorker<WebEnv, typeof import("./workers/mock-browser")>("mock-browser")
	.getExport();
await mockBrowser.setScreenshot(stubPng);

const response = await server.fetch("/reports/2026-05-29.png");
expect(await response.bytes()).toEqual(stubPng);
```
