---
"miniflare": patch
---

Improve errors for missing resource bindings

When methods like `getKVNamespace()` or `getR2Bucket()` are called with a binding name that is not configured for that resource type, Miniflare now reports the expected binding type in the error message.
