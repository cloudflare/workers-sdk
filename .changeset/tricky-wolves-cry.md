---
"miniflare": patch
"wrangler": patch
---

Move the Analytics Engine simulator implementation from JSRPC to a Wrapped binding. This fixes a regression introduced in https://github.com/cloudflare/workers-sdk/pull/8935 that preventing Analytics Engine bindings working in local dev for Workers with a compatibility date prior to JSRPC being enabled.
