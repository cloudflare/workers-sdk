---
"miniflare": patch
"wrangler": patch
---

fix: ensure we do not rewrite external Origin headers in wrangler dev

In https://github.com/cloudflare/workers-sdk/pull/4812 we tried to fix the Origin headers to match the Host header but were overzealous and rewrote Origin headers for external origins (outside of the proxy server's origin).

This is now fixed, and moreover we rewrite any headers that refer to the proxy server on the request with the configured host and vice versa on the response.

This should ensure that CORS is not broken in browsers when a different host is being simulated based on routes in the Wrangler configuration.
