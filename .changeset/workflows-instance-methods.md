---
"@cloudflare/workflows-shared": minor
"miniflare": minor
---

Workflow instances now support pause, resume, restart, and terminate in local dev.

```js
const instance = await env.MY_WORKFLOW.create({
	id: "my-instance",
});

await instance.pause(); // pauses after the current step completes
await instance.resume(); // resumes from where it left off
await instance.restart(); // restarts the workflow from the beginning
await instance.terminate(); // terminates the workflow immediately
```
