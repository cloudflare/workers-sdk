# Integration testing Workers with `createTestHarness()`

This fixture is the complete runnable example linked from the `createTestHarness()` docs. It shows how to test a realistic multi-Worker app's production build output from different test runners.

For the testing patterns demonstrated here, refer to the [`createTestHarness()` guide](https://developers.cloudflare.com/workers/testing/test-harness/).

## Example app

The app has three Workers:

| Worker         | Route                  | Role                                                                                                                      |
| -------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `web-worker`   | `example.com/*`        | Handles user-facing routes, calls the API Worker over a service binding, and uses Browser Rendering to generate previews. |
| `api-worker`   | `api.example.com/v1/*` | Fetches upstream user data, caches it in KV, and stores scheduled reports in D1.                                          |
| `mock-browser` | none                   | Test-only Worker used to replace the Web Worker's Browser Rendering binding.                                              |

Each Worker is a project with its own `cloudflare.config.ts`, built by the Cloudflare Vite plugin into its own Build Output.

## What this fixture covers

- Setup [Vitest](https://vitest.dev/) and [Playwright](https://playwright.dev/) against the Workers' Build Output.
- Route dispatch across multiple Workers.
- Direct Worker calls with `server.getWorker(name)`.
- D1 migration setup with `worker.applyD1Migrations()`.
- Scheduled handler dispatch.
- Test-only binding overrides for platform bindings.
- Calling a Worker's default export with `server.getWorker(name).getExport()`.
- Outbound request mocking with MSW.
- Local storage reset between tests.
- Debug output with `server.debug()`.
- Runtime log assertions with `server.getLogs()` and `server.clearLogs()`.

## Run this example

To build each Worker's Build Output, run:

```sh
pnpm build --filter @fixture/create-test-harness-example
```

Then run the tests with:

```sh
pnpm --filter @fixture/create-test-harness-example test:vitest
pnpm --filter @fixture/create-test-harness-example test:playwright
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

## Related docs

- [Write a basic integration test with `createTestHarness()`](https://developers.cloudflare.com/workers/testing/test-harness/get-started/)
- [Configure the test harness](https://developers.cloudflare.com/workers/testing/test-harness/configure/)
- [Prepare test state](https://developers.cloudflare.com/workers/testing/test-harness/prepare-test-state/)
- [Interact with Workers](https://developers.cloudflare.com/workers/testing/test-harness/interact-with-workers/)
- [Integrations](https://developers.cloudflare.com/workers/testing/test-harness/integrations/)
- [`createTestHarness()` API reference](https://developers.cloudflare.com/workers/wrangler/api/#createtestharness)
