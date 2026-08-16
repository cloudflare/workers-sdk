---
"@cloudflare/vitest-pool-workers": minor
---

Mocking requests with MSW in Worker tests now requires MSW >= 2.14

`@cloudflare/vitest-pool-workers` previously shipped internal shims to make MSW work inside the workerd runtime. MSW 2.14 added that support natively, so those shims have been removed.

If you mock requests with MSW in your Worker tests, make sure you're on MSW `>= 2.14`; older versions will no longer intercept requests. You can keep using `setupServer()` from `msw/node`, or adopt the official [`@msw/cloudflare`](https://github.com/mswjs/cloudflare) integration via `setupNetwork()`. See the updated [`request-mocking` example fixture](https://github.com/cloudflare/workers-sdk/tree/main/fixtures/vitest-pool-workers-examples/request-mocking) for the recommended pattern.
