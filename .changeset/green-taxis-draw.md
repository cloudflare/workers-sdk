---
"miniflare": patch
---

Reject non-local `/cdn-cgi/*` requests in Miniflare

Miniflare now validates `Host` and `Origin` on `/cdn-cgi/*` requests before request rewriting. Requests are still allowed for localhost, configured route hostnames, and the configured upstream hostname, but non-local hostnames can no longer reach internal development endpoints such as platform-proxy, handler routes, live reload, and the local explorer.
