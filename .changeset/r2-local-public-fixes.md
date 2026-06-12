---
"miniflare": patch
---

Fix edge cases on the local R2 public bucket endpoint (`/cdn-cgi/local/r2/public`) to match r2.dev: write methods are rejected with 401, malformed/multiple/inverted ranges with 400 and unsatisfiable ranges (including `bytes=-0`) with 416, `Range` is honored on HEAD requests with a bodyless 206, `Content-Range` is correct for suffix ranges, and object keys are percent-decoded exactly once (keys containing a literal `%` no longer fail). Unread object bodies are also cancelled (on HEAD and unsatisfiable-range responses) instead of leaking a read stream until garbage collection.
