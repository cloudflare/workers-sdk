---
"miniflare": patch
---

Replay the request body when `dispatchFetch()` retries HTTP 421

A known-length POST that receives 421 used to throw `UND_ERR_REQ_CONTENT_LENGTH_MISMATCH`. The retry aborted the connection before the response was finished, which dropped the body while keeping the original `Content-Length`. The abort from that retry is now ignored so the same bytes are sent again.
