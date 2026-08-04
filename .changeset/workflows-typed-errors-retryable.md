---
"miniflare": minor
---

Add an experimental `retryable` hint to Workflows binding errors in local dev

When the experimental `workflows_typed_errors` compatibility flag is enabled, errors thrown by the Workflows binding methods (`create`, `get`, `createBatch`, etc.) carry a `retryable` boolean classifying whether the failure is safe to retry. This mirrors the behavior in workerd/production and lets you branch on `err.retryable` locally:

```js
try {
	await env.MY_WORKFLOW.create({ id });
} catch (err) {
	if (err.retryable) {
		// back off + retry
	} else {
		throw err;
	}
}
```

Opt-in and non-breaking: with the flag off, errors are unchanged. `retryable` is only ever `true` for backpressure / rate-limit / temporary-migration signals; every other failure (and any unknown error) is non-retryable. As experimental, the classification may change until the flag is promoted to a default compatibility date.
