---
"wrangler": minor
---

Introduce `createTestHarness()` for integration testing Workers

It runs Workers in a local preview environment using production build output and works with both Wrangler projects and Workers built by the Cloudflare Vite plugin.

Use it from any Node.js test runner to send requests to individual Workers, trigger scheduled events, reset the server between tests, and mock outbound requests with libraries that intercept `globalThis.fetch()`, such as MSW:

```ts
import { createTestHarness } from "wrangler";

const server = createTestHarness({
	workers: [
		{ configPath: "./dist/web_worker/wrangler.json" },
		{ configPath: "./dist/api_worker/wrangler.json" },
	],
});

await server.listen();
await server.fetch("http://example.com");

const apiWorker = server.getWorker("api-worker");
await apiWorker.fetch("http://example.com/users/123");
await apiWorker.scheduled({ cron: "0 0 * * *" });

await server.reset();
await server.close();
```
