---
"@cloudflare/test-server": minor
---

Add `@cloudflare/test-server` for testing a project's production build

Like Wrangler's `createTestHarness()`, `createTestServer()` runs your Workers in tests, but from the Build Output that `cf build` writes, so your tests exercise what you deploy. Remote bindings use the same credentials as cf.

```ts
const server = createTestServer({ workers: [{ projectDir: "./" }] });
await server.listen();
const response = await server.fetch("/");
```

This package is experimental and its API may change in minor versions.
