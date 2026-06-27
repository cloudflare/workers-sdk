# Integration testing Workers with `createTestHarness()`

This fixture is the complete runnable example linked from the `createTestHarness()` docs. It shows how to test a realistic multi-Worker app's production build output from different test runners.

For the testing patterns demonstrated here, refer to the [`createTestHarness()` examples guide](https://developers.cloudflare.com/workers/testing/test-harness/examples/).

## Example app

The app has two Workers:

| Worker       | Route                  | Role                                                                             |
| ------------ | ---------------------- | -------------------------------------------------------------------------------- |
| `web-worker` | `example.com/*`        | Handles user-facing routes and calls the API Worker over a service binding.      |
| `api-worker` | `api.example.com/v1/*` | Fetches upstream user data, caches it in KV, and stores scheduled reports in D1. |

## What this fixture covers

- Setup [Vitest](https://vitest.dev/) against Workers developed with Wrangler.
- Setup [Playwright](https://playwright.dev/) against Workers built by the Cloudflare Vite plugin.
- Route dispatch across multiple Workers.
- Direct Worker calls with `server.getWorker(name)`.
- D1 migration setup with `worker.applyD1Migrations()`.
- Scheduled handler dispatch.
- Outbound request mocking with MSW.
- Local storage reset between tests.
- Debug output with `server.debug()`.
- Runtime log assertions with `server.getLogs()` and `server.clearLogs()`.

## Run this example

To build the packages, run:

```sh
pnpm build --filter @fixture/create-test-harness-example
```

Then run the tests with:

```sh
pnpm --filter @fixture/create-test-harness-example test:vitest
pnpm --filter @fixture/create-test-harness-example test:playwright
```

## Files

| File                                                       | Purpose                                          |
| ---------------------------------------------------------- | ------------------------------------------------ |
| [`tests/vitest.test.ts`](tests/vitest.test.ts)             | Example for testing with Vitest.                 |
| [`tests/playwright.test.ts`](tests/playwright.test.ts)     | Example for testing with Playwright.             |
| [`vite.config.ts`](vite.config.ts)                         | Builds Vite-generated Worker configs.            |
| [`workers/web/index.ts`](workers/web/index.ts)             | User-facing Worker.                              |
| [`workers/web/wrangler.jsonc`](workers/web/wrangler.jsonc) | Web Worker config.                               |
| [`workers/api/index.ts`](workers/api/index.ts)             | API Worker with KV, D1, and scheduled job logic. |
| [`workers/api/wrangler.jsonc`](workers/api/wrangler.jsonc) | API Worker config.                               |

## Related docs

- [`createTestHarness()` guide](https://developers.cloudflare.com/workers/testing/test-harness/)
- [`createTestHarness()` API reference](https://developers.cloudflare.com/workers/wrangler/api/#createtestharness)
