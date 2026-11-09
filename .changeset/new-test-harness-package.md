---
"@cloudflare/test-harness": minor
---

Add the experimental `@cloudflare/test-harness` package, which runs a project's Build Output in tests

It has the API of Wrangler's `createTestHarness`, but each Worker comes from a build instead of a Wrangler config: `{ buildOutput: "./" }`, with `name` to pick a non-default Worker. `applyD1Migrations()` takes a `dir` option, as Build Output has no migrations config. The package is experimental, and its API may change.
