---
"wrangler": patch
---

`wrangler tail` now proactively refreshes the tail session shortly before its server-side expiry time. Previously, when a tail session expired (roughly 1 hour), log delivery would silently stop with no error or reconnect, leaving the terminal appearing frozen. The session is now transparently refreshed so tailing continues uninterrupted.
