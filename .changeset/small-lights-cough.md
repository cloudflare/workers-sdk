---
"@cloudflare/workers-utils": patch
---

fix: Default service field in bindings to worker name if missing

Introduces logic to default the 'service' field in service bindings to the worker name when not explicitly provided. Adds tests to verify this behavior and to ensure an error is raised if both the service field and worker name are missing.
