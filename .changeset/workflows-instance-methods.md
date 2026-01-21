---
"@cloudflare/workflows-shared": minor
---

Workflow instances now support pause, resume, restart, and terminate in local dev.

```js
const handle = await env.MY_WORKFLOW.create({
	id: "my-instance",
	params: { input: "data" },
});

await handle.pause(); // pauses after the current step completes
await handle.resume(); // resumes from where it left off
await handle.restart(); // restarts the workflow from the beginning
await handle.terminate(); // terminates the workflow immediately
```
