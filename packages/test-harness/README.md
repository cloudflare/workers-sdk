# `@cloudflare/test-harness`

Runs a project's Build Output in tests.

```ts
import { createTestHarness } from "@cloudflare/test-harness";
import { bindings } from "cf/config";

const harness = createTestHarness({
	workers: [
		// The project directory containing the build's `.cloudflare/output`
		{ projectDir: "./", envOverrides: { API_TOKEN: bindings.text("test") } },
	],
});

await harness.listen();
const response = await harness.fetch("/");

await harness.close();
```

This package is experimental and its API may change in minor versions.
