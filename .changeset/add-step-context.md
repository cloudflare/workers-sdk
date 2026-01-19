---
"@cloudflare/workflows-shared": minor
---

Adds step context with attempt count to step.do() callbacks.

Workflow step callbacks now receive a context object containing the current attempt number (1-indexed).
This allows developers to access which retry attempt is currently executing.

Example:

```ts
await step.do("my-step", async (ctx) => {
	// ctx.attempt is 1 on first try, 2 on first retry, etc.
	console.log(`Attempt ${ctx.attempt}`);
});
```
