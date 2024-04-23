---
"wrangler": patch
---

fix: fix broken Durable Object local proxying (when no `cf` property is present)

A regression was introduced in wrangler 3.46.0 (https://github.com/cloudflare/workers-sdk/pull/5215)
which made it so that missing `Request#cf` properties are serialized as `"undefined"`, this in turn
throws a syntax parse error when such values are parsed via `JSON.parse` breaking the communication
with Durable Object local proxies. Fix such issue by serializing missing `Request#cf` properties as
`"{}"` instead.
