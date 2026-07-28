---
"@cloudflare/vitest-pool-workers": patch
---

Ignore workerd's `disconnected: peer disconnected without gracefully ending TLS session` exception logs

When tests make real `fetch()` calls to external TLS endpoints, servers and load balancers routinely close idle keepalive connections without sending a TLS `close_notify`. No request fails — the connection is idle — but workerd logs a `kj/compat/tls.c++` exception with a full stack trace each time, flooding otherwise green test runs. This is the TLS sibling of the `disconnected: ...` messages already in the ignore list, so filter it the same way.
