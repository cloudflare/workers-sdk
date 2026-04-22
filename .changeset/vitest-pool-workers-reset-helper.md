---
"@cloudflare/vitest-pool-workers": minor
---

Add `reset()` and `abortAllDurableObjects()` helpers to `cloudflare:test`

The `reset()` helper deletes all data from attached bindings, and resets all Durable Object instances. This is useful for resetting state between test blocks.

The `abortAllDurableObjects()` helper resets all Durable Object instances without deleting persisted data.

```ts
import { reset } from "cloudflare:test";
import { afterEach } from "vitest";

afterEach(async () => {
	await reset();
});
```
