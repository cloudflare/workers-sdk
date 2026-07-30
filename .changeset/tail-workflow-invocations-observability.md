---
"miniflare": patch
---

Capture Workflows invocations in local observability

When local observability is enabled, the Workflows engine service is now attached to the trace collector (like every user worker), so workflow runs show up in the Local Explorer's Observability view attributed to the workflow. Previously the engine ran outside the per-user-worker tail wiring, so workflow invocations left no traces, spans, or logs in the local store.
