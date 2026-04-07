---
"miniflare": patch
---

fix(miniflare): prevent fetch failed on POST 401 responses

Set `credentials: "omit"` in miniflare's fetch wrapper to bypass undici's HTTP 401 authentication retry logic. Workerd uses streamed request bodies where `body.source` is null, causing undici to throw "expected non-null body source" on POST 401 responses.
