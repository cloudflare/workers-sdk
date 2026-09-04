---
"miniflare": patch
---

Clean up Miniflare listener startup error handlers

Loopback and inspector servers now remove startup-only error handlers after binding and close the server after bind failures.
