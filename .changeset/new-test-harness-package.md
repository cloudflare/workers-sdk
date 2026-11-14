---
"@cloudflare/test-harness": minor
---

Add `@cloudflare/test-harness` for testing a project's production build

The harness runs each Worker from its build, as `vite preview` does, instead of building it for the test, so your tests cover what you deploy. It has the API of Wrangler's `createTestHarness()`, so tests written for Wrangler can move to cf without Wrangler installed.

```ts
const server = createTestHarness({ workers: [{ project: "./" }] });
await server.listen();
const response = await server.fetch("/");
```

This package is experimental, and its API may change.
