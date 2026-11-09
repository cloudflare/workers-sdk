---
"@cloudflare/test-harness": minor
---

Add the experimental `@cloudflare/test-harness` package, which runs a project's Build Output in tests

It starts with Wrangler's `createTestHarness` options for each Worker (`vars`, `secrets` and `bindingOverrides`), plus `listen()`, `fetch()` and `close()`. Instead of a Wrangler config, each Worker comes from a build: `{ buildOutput: "./" }`, with `name` to pick a non-default Worker. The package is experimental, and its API may change.
