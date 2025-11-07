---
"@cloudflare/unenv-preset": patch
"wrangler": patch
---

Use the native `node:trace_events` module when available

It is enabled when the `enable_nodejs_trace_events_module` compatibility flag is set.
