---
"wrangler": minor
"miniflare": minor
"@cloudflare/config": minor
"@cloudflare/workers-utils": minor
"@cloudflare/deploy-helpers": minor
---

Add a `retry` policy to Durable Object classes

The Worker that exports a Durable Object class sets how hard the runtime retries calls to it. The policy applies however the class is reached, through `env`, `ctx.exports`, or bindings from other Workers, and callers cannot override it:

```jsonc
{
	"exports": {
		"Counter": {
			"type": "durable-object",
			"storage": "sqlite",
			"retry": { "max_attempts": 5, "timeout_ms": 10000 },
		},
	},
}
```

`max_attempts` is the number of retries after the initial request, from 0 to 10. Zero disables retries. `timeout_ms` is a retry timeout in milliseconds, from 500 to 60,000, measured from the start of the call. It is not a request timeout, and the initial request always runs to completion. Omitted properties use the runtime defaults.

Workers that use `migrations` instead of `exports` can set `retry` on a Durable Object binding to a class in the same Worker. Wrangler rejects `retry` on a binding with `script_name`, on any binding in a Worker that declares Durable Objects in `exports`, and on two bindings to one class with different values. Wrangler sends the policy with the export or binding on deploy, versions upload, and preview.

In the experimental config API, live `exports.durableObject()` entries accept `retry: { maxAttempts, timeoutMs }`. Bindings do not. Locally, Miniflare writes the policy to the workerd Durable Object namespace. Miniflare's `durableObjects` and `additionalUnboundDurableObjects` entries accept `retryMaxAttempts` and `retryTimeoutMs`, which apply to the class and are not allowed with `scriptName`.
