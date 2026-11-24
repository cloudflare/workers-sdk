---
"@cloudflare/test-harness": minor
---

Add `@cloudflare/test-harness` for testing a project's production build

Like Wrangler's `createTestHarness()`, the harness runs your Workers in tests, but from the Build Output that `cf build` writes, so your tests exercise what you deploy. Remote bindings use the same credentials as cf.

```ts
const harness = createTestHarness({ workers: [{ projectDir: "./" }] });
await harness.listen();
const response = await harness.fetch("/");
```

This package is experimental and its API may change in minor versions.
