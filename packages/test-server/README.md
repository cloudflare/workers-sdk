# `@cloudflare/test-server`

Runs a project's Build Output in tests.

```ts
import { createTestServer } from "@cloudflare/test-server";
import { bindings } from "cf/config";

const server = createTestServer({
	workers: [
		// The project directory containing the build's `.cloudflare/output`
		{ projectDir: "./", envOverrides: { API_TOKEN: bindings.text("test") } },
	],
});

await server.listen();
const response = await server.fetch("/");

await server.close();
```

This package is experimental and its API may change in minor versions.
