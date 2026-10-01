---
"miniflare": minor
"wrangler": minor
---

Support the new Workflows `createBatch()` API in local development

Local Workflows bindings now accept object-form batches that create instances from a count or a list of instance options. The result includes handles for created instances and indexed per-instance errors, matching the runtime API while preserving the deprecated array form.
