---
"miniflare": patch
---

fix: ensure redirect responses handled correctly with `dispatchFetch()`

Previously, if your Worker returned a redirect response, calling `dispatchFetch(url)` would send another request to the original `url` rather than the redirect. This change ensures redirects are followed correctly.

- If your Worker returns a relative redirect or an absolute redirect with the same origin as the original `url`, the request will be sent to the Worker.
- If your Worker instead returns an absolute redirect with a different origin, the request will be sent to the Internet.
- If a redirected request to a different origin returns an absolute redirect with the same origin as the original `url`, the request will also be sent to the Worker.
