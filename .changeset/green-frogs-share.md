---
"miniflare": patch
---

Default local resource binding identifiers in Miniflare v5 configs

KV, D1, R2, Queue, and Flagship bindings can now omit their local resource identifiers. Miniflare defaults omitted identifiers to `<bindingName>-<workerName>`, or `<bindingName>-worker` for unnamed workers.
