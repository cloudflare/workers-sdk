---
"miniflare": patch
---

fix: Replace `crypto.subtle.timingSafeEqual` with pure-JS constant-time comparison in ProxyServer DO

Replaces `crypto.subtle.timingSafeEqual` with a pure-JS constant-time comparison in miniflare's `ProxyServer` Durable Object, removing an unnecessary `crypto.subtle` dependency from the DO context which can be disallowed within Durable Object I/O gates in newer workerd.
