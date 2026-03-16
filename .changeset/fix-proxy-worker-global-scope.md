---
"miniflare": patch
"@cloudflare/vitest-pool-workers": patch
---

fix: Support vitest-compatible runners in pool worker setTimeout monkeypatch

The pool worker's `monkeypatchedSetTimeout` checked `fromVitest` (a path-based regex matching `/vitest/`) before the `NOOP` callback check. Vitest-compatible runners like `@voidzero-dev/vite-plus-test` use the same fake-timers `NOOP` pattern from `@sinonjs/fake-timers` but install to a different path, so the regex didn't match and `setTimeout(NOOP, 0)` was forwarded to the real `setTimeout`, which workerd rejects as disallowed global-scope I/O.

Move the `NOOP` check before the `fromVitest` guard so any vitest-compatible runner's fake-timers initialization is handled correctly.

Also replaces `crypto.subtle.timingSafeEqual` with a pure-JS constant-time comparison in miniflare's `ProxyServer` Durable Object, removing an unnecessary `crypto.subtle` dependency from the DO context.

Fixes #12921
