---
"miniflare": minor
---

Experimental: capture local-dev traces into the SQLite store

Wires the local observability collector to capture. It folds each user worker's streaming tail straight into spans + logs — using the Workers Observability attribute conventions (`faas.trigger`, `http.request.method`, `http.response.status_code`, `cloudflare.outcome`, `cpu_time_ms`, …) so a local waterfall matches production — and persists them to the internal `TraceStore` Durable Object. Every invocation emits a synthetic log (so silent workers still show up), `console.*` output is captured, and uncaught exceptions surface as both a span error and an error-level log. No OpenTelemetry SDK/transport is needed locally, so there are no added runtime dependencies.
