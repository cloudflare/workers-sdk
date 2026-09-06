# ⚠️ basics-integration-auxiliary

This Worker contains basic `fetch` and `scheduled` handlers. Instead of running the Worker-under-test in the same Worker as the test runner, this example defines the Worker-under-test as an _auxiliary_ Worker. This means the Worker runs in a separate isolate to the test runner, with a different global scope. The Worker-under-test runs in an environment closer to production, but Vite transformations and hot-module-reloading aren't applied to the Worker—you must compile your TypeScript to JavaScript beforehand. This is done in [global-setup.ts](global-setup.ts). Note auxiliary workers cannot be configured from `wrangler.toml` files—you must use Miniflare `WorkerOptions`.

| Test                                                                                      | Overview                           |
| ----------------------------------------------------------------------------------------- | ---------------------------------- |
| [fetch-integration-auxiliary.test.ts](test/fetch-integration-auxiliary.test.ts)           | Basic `fetch` integration test     |
| [scheduled-integration-auxiliary.test.ts](test%2Fscheduled-integration-auxiliary.test.ts) | Basic `scheduled` integration test |
