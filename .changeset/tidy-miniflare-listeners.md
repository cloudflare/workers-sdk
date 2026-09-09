---
"miniflare": patch
---

Handle Miniflare listener startup failures consistently

Loopback and inspector servers now remove startup-only error handlers after binding and close the server after bind failures. Inspector bind failures are observed immediately and propagated through readiness, URL access, and disposal.
