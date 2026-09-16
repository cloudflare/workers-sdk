---
"miniflare": patch
---

Prevent synchronous binding calls from failing intermittently under load

Miniflare now keeps synchronous binding requests and responses correctly paired when background work is delayed. This prevents rare cascades of assertion failures in local development and CI, including when using synchronous D1 methods such as `prepare()` and `bind()`.
