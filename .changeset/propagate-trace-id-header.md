---
"miniflare": patch
---

Propagate `cf-trace-id` header on remote binding proxy requests

When the `CF_TRACE_ID` environment variable is set, its value is now forwarded as a `cf-trace-id` header on outgoing remote binding proxy requests. This makes it easier to correlate traces when debugging remote bindings in local development.
