---
"@cloudflare/workers-auth": patch
"wrangler": patch
---

Time out the OAuth token request instead of waiting indefinitely

The request that exchanges an authorization code or refresh token for an access token had no timeout, so a stalled connection (for example behind an HTTP proxy) could leave `wrangler login` hanging silently for many minutes after the browser step had succeeded. The request now gives up after 30 seconds and reports that the Cloudflare auth server could not be reached.
