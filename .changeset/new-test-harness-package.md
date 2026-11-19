---
"@cloudflare/test-harness": minor
---

Add `@cloudflare/test-harness` for testing a project's production build

The harness runs each Worker from its build output so your tests exercise what you deploy. It is the cf equivalent of Wrangler's `createTestHarness()`.

```ts
const server = createTestHarness({ workers: [{ projectDir: "./" }] });
await server.listen();
const response = await server.fetch("/");
```

This package is experimental and its API may change in minor versions.
