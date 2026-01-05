---
"@cloudflare/vitest-pool-workers": minor
"@cloudflare/workflows-shared": minor
"miniflare": minor
---

Add Workflows test handlers in vitest-pool-workers to get the Workflow instance output and error:

- `getOutput()`: Returns the output of the successfully completed Workflow instance.
- `getError()`: Returns the error information of the errored Workflow instance.

Example:

```ts
// First wait for the workflow instance to complete:
await expect(
	instance.waitForStatus({ status: "complete" })
).resolves.not.toThrow();

// Then, get its output
const output = await instance.getOutput();

// Or for errored workflow instances, get their error:
await expect(
	instance.waitForStatus({ status: "errored" })
).resolves.not.toThrow();
const error = await instance.getError();
```
