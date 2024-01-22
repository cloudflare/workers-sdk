---
"miniflare": patch
---

fix: ensure that Origin header is rewritten as necessary

The `wrangler dev` command puts the Worker under test behind a proxy server.
This proxy server should be transparent to the client and the Worker, which
means that the `Request` arriving at the Worker with the correct `url` property,
and `Host` and `Origin` headers.
Previously we fixed the `Host` header but missed the `Origin` header which is
only added to a request under certain circumstances, such as cross-origin requests.

This change fixes the `Origin` header as well, so that it is rewritten, when it exists,
to use the `origin` of the `url` property.

Fixes #4761
