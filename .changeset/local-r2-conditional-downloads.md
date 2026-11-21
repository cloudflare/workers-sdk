---
"miniflare": patch
---

Honor conditional R2 downloads in Local Explorer

Local R2 downloads return an empty HTTP 304 response when an object's ETag matches `If-None-Match` or the object has not changed since `If-Modified-Since`.
