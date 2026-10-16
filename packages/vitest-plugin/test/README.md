# `@cloudflare/vitest-plugin` E2E Tests

This directory implements E2E tests for the `@cloudflare/vitest-plugin` package.

`@cloudflare/vitest-plugin` and its local dependencies are built and then published to a mock npm registry, then installed in a temporary directory to test against.

If possible, tests should be written in the [`fixtures/vitest-plugin-examples`](../../../fixtures/vitest-plugin-examples) directory.
These tests run against `@cloudflare/vitest-plugin` itself, and execute much faster.
They're also a source of documentation for end users.

Use the [`misc`](../../../fixtures/vitest-plugin-examples/misc) directory if your test doesn't really belong with an example.
