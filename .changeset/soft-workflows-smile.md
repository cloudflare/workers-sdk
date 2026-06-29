---
"miniflare": patch
"wrangler": minor
---

Add Workflow introspection to `createTestHarness()`

Worker handles can now introspect Workflow bindings by name, allowing tests to disable sleeps, mock step results, and wait for Workflow outcomes. Tests can introspect a known Workflow instance by ID or track instances created after introspection starts.

```ts
const harness = createTestHarness({
	workers: [{ configPath: "./wrangler.json" }],
});

const worker = harness.getWorker();
await using workflow = await worker.introspectWorkflow("MY_WORKFLOW");

await workflow.modifyAll((modifier) =>
	modifier.disableSleeps([{ name: "wait-for-approval" }])
);

const response = await worker.fetch("/start-workflow");
const [instance] = await workflow.get();
await instance.waitForStatus("complete");
```
