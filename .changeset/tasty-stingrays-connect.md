---
"@cloudflare/config": minor
"@cloudflare/workers-utils": minor
"miniflare": minor
"wrangler": minor
---

Support UDP connect handlers in local development

The experimental `connect` configuration now accepts `protocol: "udp"`. UDP datagrams are delivered to the Worker's `connect()` handler using workerd's value-mode socket streams.
