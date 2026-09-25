---
"miniflare": minor
"wrangler": minor
"@cloudflare/config": minor
---

Support Durable Object binding retry policies in local development

The `retry` policy on Durable Object bindings is now passed to workerd in local development. Miniflare's `durableObjects` options accept `retryMaxAttempts` and `retryTimeoutMs`, and the experimental config API accepts `retry: { maxAttempts, timeoutMs }` on `durable-object` bindings, which converts to Wrangler's `retry` shape.
