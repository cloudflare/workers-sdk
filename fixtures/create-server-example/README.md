# `createServer()` example

This fixture shows how to use the `createServer()` API as an integration-test harness for a multi-Worker app. It includes examples for both Wrangler and Vite projects.

The example app has two Workers:

| Worker       | Route               | Role                                                                          |
| ------------ | ------------------- | ----------------------------------------------------------------------------- |
| `web-worker` | `example.com/*`     | Handles user-facing routes and calls the API Worker over a service binding.   |
| `api-worker` | `example.com/api/*` | Fetches upstream user data, caches it in KV, and generates scheduled reports. |

The tests demonstrate:

- Starting Workers from Wrangler config files with `createServer()`.
- Using `server.fetch()` to dispatch through configured routes.
- Using `server.getWorker(name)` to call a specific Worker's `fetch()` or `scheduled()` handler directly.
- Mocking Worker outbound requests with MSW.
- Calling `server.clearStorage()` between tests to reuse a server while keeping local storage isolated.

## Files

| File                                                               | Purpose                                        |
| ------------------------------------------------------------------ | ---------------------------------------------- |
| [`tests/wrangler-project.test.ts`](tests/wrangler-project.test.ts) | Example for testing Wrangler projects.         |
| [`tests/vite-project.test.ts`](tests/vite-project.test.ts)         | Example for testing Vite projects.             |
| [`src/web.ts`](src/web.ts)                                         | User-facing Worker.                            |
| [`src/api.ts`](src/api.ts)                                         | API Worker with KV and scheduled job behavior. |
| [`wrangler.web.jsonc`](wrangler.web.jsonc)                         | Web Worker config.                             |
| [`wrangler.api.jsonc`](wrangler.api.jsonc)                         | API Worker config.                             |
| [`vite.config.ts`](vite.config.ts)                                 | Builds Vite-generated Worker configs.          |
