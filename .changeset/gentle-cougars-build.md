---
"wrangler": minor
---

Add `createServer()` for running Workers programmatically

Wrangler now includes `createServer()` for use as a local dev server or integration test harness. It starts Workers locally from Wrangler config files, and also works with Workers built by the Cloudflare Vite plugin.

You can use it from any Node.js test runner to send requests to individual Workers, trigger scheduled events, reset the server between tests, and mock outbound requests with libraries that intercept `globalThis.fetch()`, such as MSW:

```ts
import { createServer } from "wrangler";

const server = createServer({
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
