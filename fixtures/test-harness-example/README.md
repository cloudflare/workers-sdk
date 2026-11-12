# Testing production build with `@cloudflare/test-harness`

This example tests the production build of a multi-Worker app with `@cloudflare/test-harness`, from Vitest and from Playwright.

## Example app

The app has three Workers:

| Worker         | Source                                         | Route                  | Role                                                                                                                      |
| -------------- | ---------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `web-worker`   | [`workers/web`](workers/web)                   | `example.com/*`        | Handles user-facing routes, calls the API Worker over a service binding, and uses Browser Rendering to generate previews. |
| `api-worker`   | [`workers/api`](workers/api)                   | `api.example.com/v1/*` | Fetches upstream user data, caches it in KV, and stores scheduled reports in D1.                                          |
| `mock-browser` | [`workers/mock-browser`](workers/mock-browser) | none                   | Test-only Worker used to replace the Web Worker's Browser Rendering binding.                                              |

Each Worker is a project with its own `cloudflare.config.ts`, built by the Cloudflare Vite plugin into its own Build Output.

## What this fixture covers

- Running Workers from several projects' Build Output in one harness.
- A test-only Worker that replaces a platform binding through `envOverrides`.
- Typing each Worker from its config module with `server.getWorker<typeof import("./cloudflare.config")>()`.
- Setup with [Vitest](https://vitest.dev/) and with [Playwright](https://playwright.dev/).
- Route dispatch across multiple Workers.
- Direct Worker calls with `server.getWorker(name)`.
- D1 migration setup with `worker.applyD1Migrations()`.
- Scheduled handler dispatch.
- Calling a Worker's default export with `server.getWorker(name).getExport()`.
- Outbound request mocking with MSW.
- Local storage reset between tests.
- Debug output with `server.debug()`.
- Runtime log assertions with `server.getLogs()` and `server.clearLogs()`.

## Run this example

To build the projects, run:

```sh
pnpm build --filter @fixture/test-harness-example
```

Then run the tests with:

```sh
pnpm --filter @fixture/test-harness-example test:vitest
pnpm --filter @fixture/test-harness-example test:playwright
```

## Files

| File                                                                                     | Purpose                                                              |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`tests/vitest.test.ts`](tests/vitest.test.ts)                                           | Tests the Build Output with Vitest.                                  |
| [`tests/playwright.test.ts`](tests/playwright.test.ts)                                   | Tests the Build Output with Playwright.                              |
| [`workers/web/index.ts`](workers/web/index.ts)                                           | User-facing Worker with service and Browser Rendering binding logic. |
| [`workers/web/cloudflare.config.ts`](workers/web/cloudflare.config.ts)                   | Web Worker config.                                                   |
| [`workers/api/index.ts`](workers/api/index.ts)                                           | API Worker with KV, D1, and scheduled job logic.                     |
| [`workers/api/cloudflare.config.ts`](workers/api/cloudflare.config.ts)                   | API Worker config.                                                   |
| [`workers/mock-browser/index.ts`](workers/mock-browser/index.ts)                         | Test-only mock Worker for the Browser Rendering binding.             |
| [`workers/mock-browser/cloudflare.config.ts`](workers/mock-browser/cloudflare.config.ts) | Mock Browser Worker config.                                          |
