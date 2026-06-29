---
"@cloudflare/vitest-pool-workers": minor
---

Make Workflow introspector `get()` async

The `introspectWorkflow(...).get()` method now returns a promise, so callers must await it:

```ts
const introspector = await introspectWorkflow(env.MY_WORKFLOW);

// Before
const instances = introspector.get();

// After
const instances = await introspector.get();
```

This aligns Workflow introspection with the shared implementation used by `createTestHarness()`.
