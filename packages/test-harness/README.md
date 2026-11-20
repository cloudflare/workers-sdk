# `@cloudflare/test-harness`

Runs a project's Build Output in tests.

```ts
import { createTestHarness } from "@cloudflare/test-harness";
import { bindings } from "cf/config";

const server = createTestHarness({
	workers: [
		// The project directory containing the build's `.cloudflare/output`
		{ projectDir: "./", envOverrides: { API_TOKEN: bindings.text("test") } },
	],
});

await server.listen();
const response = await server.fetch("/");

await server.close();
```

See [`fixtures/create-test-harness-example`](https://github.com/cloudflare/workers-sdk/tree/main/fixtures/create-test-harness-example) for a complete example with Vitest and Playwright.

This package is experimental and its API may change in minor versions.
