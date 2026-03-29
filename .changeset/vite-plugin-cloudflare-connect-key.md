---
"@cloudflare/vite-plugin": patch
---

Add missing `connect` key to `WorkerEntrypoint` and `DurableObject` key lists in the runner worker

The `connect` method was added to the `WorkerEntrypoint` and `DurableObject` types in workerd 1.20260329.1 but was missing from the `WORKER_ENTRYPOINT_KEYS` and `DURABLE_OBJECT_KEYS` arrays used for RPC property access in the Vite plugin runner worker. This caused the compile-time exhaustiveness check to fail with the updated workers-types.
