---
"@cloudflare/vitest-plugin": minor
---

Add `adminWorkflowConcurrencyKeys()` to test Workflow step concurrency

Tests can now create local concurrency keys, occupy their slots, and wait until steps are waiting for them, through any Workflow binding from `env`:

```ts
import { adminWorkflowConcurrencyKeys } from "cloudflare:test";
import { env } from "cloudflare:workers";

it("waits for a free slot", async () => {
	using keys = adminWorkflowConcurrencyKeys(env.MY_WORKFLOW);
	await keys.set("payments-api", 1);
	const hold = await keys.hold("payments-api");

	const instance = await env.MY_WORKFLOW.create();
	await keys.waitForWaiters("payments-api");

	await hold.release();
	await expect
		.poll(async () => (await instance.status()).status)
		.toBe("complete");
});
```
