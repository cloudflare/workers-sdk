---
"@cloudflare/workers-utils": patch
"wrangler": patch
---

Treat 502, 503, and 504 as gateway errors during asset upload retries

`APIError.isGatewayError()` previously matched only Cloudflare's 524 timeout. Pages and Workers asset uploads use that helper to drop upload concurrency and wait longer before retrying, so a `502 Bad Gateway` HTML response from `POST /pages/assets/upload` was retried with the short backoff path and counted against `MAX_UPLOAD_ATTEMPTS` immediately.

Those HTTP gateway statuses now take the same backoff path as 524.
