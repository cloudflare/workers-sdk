---
"wrangler": minor
---

Add Build Output API support to `createTestHarness()`

The test harness can now load Workers from a Build Output API root directory, for example `createTestHarness({ workers: [{ buildOutput: "./.cloudflare/output" }] })`. This lets tests run against prebuilt Workers emitted under `.cloudflare/output/v0/workers`.
