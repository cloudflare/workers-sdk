---
"@cloudflare/test-harness": minor
---

Add the experimental `@cloudflare/test-harness` package, which runs a project's Build Output in tests

It has the API of Wrangler's `createTestHarness`, but each Worker comes from a build instead of a Wrangler config: `{ buildOutput: "./" }`, with `name` to pick a non-default Worker. Test bindings go in one `env`, written as in `cloudflare.config.ts`, instead of `vars`, `secrets` and `bindingOverrides`, and `applyD1Migrations()` takes the `dir`, `pattern` and `table` options of `cf d1 migrations apply`, since Build Output has no migrations config.
