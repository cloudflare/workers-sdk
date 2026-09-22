---
"miniflare": patch
---

Reuse keep-alive connections for `dispatchFetch()` requests

Miniflare no longer forces runtime dispatch connections to close after every request. This prevents repeated dispatches from accumulating sockets in `TIME_WAIT` and exhausting the host's ephemeral port range, while retaining Undici's normal stale keep-alive handling.
