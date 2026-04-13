---
"miniflare": patch
---

fix: Local Explorer KV bulk/get no longer fails with 413 when namespace contains large values. The endpoint now fetches each key individually instead of using the KV bulk-get API, which has a 25 MB aggregate size limit.
