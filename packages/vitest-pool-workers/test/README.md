# `@cloudflare/vitest-pool-workers` E2E Tests

This directory implements E2E tests for the `@cloudflare/vitest-pool-workers` package.

`@cloudflare/vitest-pool-workers` and its local dependencies are built and then published to a mock npm registry, then installed in a temporary directory to test against.

If possible, tests should be written in the [`fixtures/vitest-pool-workers-examples`](../../../fixtures/vitest-pool-workers-examples) directory.
These tests run against `@cloudflare/vitest-pool-workers` itself, and execute much faster.
They're also a source of documentation for end users.

Use the [`misc`](../../../fixtures/vitest-pool-workers-examples/misc) directory if your test doesn't really belong with an example.
