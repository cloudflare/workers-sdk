---
"miniflare": minor
---

Support weighted increments with `delta` in the emulated Ratelimit binding

`limit()` now accepts an optional `delta`, matching production, so a single call can count for more than one request:

```js
const { success } = await env.MY_RATE_LIMITER.limit({
	key: userId,
	delta: tokens,
});
```

`delta` defaults to `1`. As in production, the decision is based on the count before the call, so a call is allowed while any headroom remains even if its `delta` takes the count past the limit, and a rejected call is not counted. Invalid values (zero, negative, non-numeric or larger than a `uint32`) throw the same errors as production. Previously local development rejected `delta` with `bad rate limit options: [delta]`.
