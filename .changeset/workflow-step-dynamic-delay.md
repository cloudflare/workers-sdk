---
"wrangler": minor
"@cloudflare/vite-plugin": minor
"@cloudflare/vitest-pool-workers": patch
"miniflare": minor
---

Support dynamic retry delays for Workflow steps in local dev

A step's `retries.delay` can now be a function that computes the delay per failed attempt, in addition to a static duration. The function receives `{ ctx, error }` and returns a delay (a number of milliseconds or a duration string like `"30 seconds"`), and its result is fed into the configured `backoff`.

```js
await step.do(
	"call flaky API",
	{
		retries: {
			limit: 5,
			backoff: "constant",
			delay: ({ ctx }) => ctx.attempt * 1000,
		},
	},
	async () => {
		/* ... */
	}
);
```

The function is invoked once per failed attempt with a 5 second timeout. If it throws, times out, or returns an invalid value, the step fails without further retries.
