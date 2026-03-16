---
"miniflare": patch
---

fix: Replace `crypto.subtle.timingSafeEqual` with constant-time JS comparison in ProxyServer

The `ProxyServer` Durable Object used `crypto.subtle.timingSafeEqual()` for secret validation in its fetch handler. In newer workerd versions, `crypto.subtle` operations can be restricted within Durable Object I/O gates, causing a "Disallowed operation called within global scope" error during vitest-pool-workers startup.

This replaces the call with a pure-JS constant-time byte comparison that avoids the `crypto.subtle` dependency entirely. The comparison is still constant-time (XOR accumulator with no early exit on mismatch) and is safe for this use case since the secret is only used for local proxy authentication.

Fixes #12921
