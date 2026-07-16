---
"wrangler": patch
---

Type `unstable_startWorker`, `DevEnv.startWorker`, and `ConfigController.set`/`patch` against `WranglerStartDevWorkerInput`, so the wrangler-specific `dev.structuredLogsHandler` field the runtime already honors is expressible through the public API. Previously the public signatures took the base `StartDevWorkerInput`, and callers passing the handler needed a cast while internal callers (the test harness) routed the wider type around the signature.
