---
"miniflare": minor
---

Capture local observability spans over OTLP instead of from streaming tail events

With `unsafeObservability`, workerd now exports every invocation's spans to the local observability collector over OTLP, rather than the collector rebuilding them from streaming tail events. Spans carry precise timestamps rather than the coarse I/O time tail events report. Logs and exceptions are still captured from the tail stream. Requires a workerd release with the `tracing.otlp` config setting.
