---
"@cloudflare/config": minor
"@cloudflare/workers-utils": minor
"miniflare": minor
"wrangler": minor
---

Support UDP connect handlers in local development

The experimental `connect` configuration now accepts `protocol: "udp"`, with optional `idle_timeout_ms` and `max_pending_bytes` settings. UDP datagrams are delivered to the Worker's `connect()` handler using workerd's value-mode socket streams, and can be tested with `Miniflare#dispatchConnect({ protocol: "udp" })`.
