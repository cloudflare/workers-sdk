---
"@cloudflare/workers-shared": patch
---

Add Sentry error reporting and Jaeger tracing to asset-worker outer entrypoint RPC methods

The outer entrypoint's RPC methods (`unstable_canFetch`, `unstable_getByETag`, `unstable_getByPathname`, `unstable_exists`) previously had no error reporting or tracing. When the router-worker calls these methods via RPC and they throw, the error was invisible -- no Sentry report, no Jaeger trace. This adds a `withObservability` helper that wraps each RPC method with Sentry error capture and a Jaeger span, and propagates trace context to the inner entrypoint so spans are connected across the loopback boundary.
