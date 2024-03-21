---
"wrangler": patch
---

fix: Ignore OPTIONS requests in Wrangler's oauth server

In Chrome v123, the auth requests from the browser back to wrangler now first include a CORS OPTIONS preflight request before the expected GET request. Wrangler was able to successfully complete the login with the first (OPTIONS) request, and therefore upon the second (GET) request, errored because the token exchange had already occured and could not be repeated.

Wrangler now stops processing the OPTIONS request before completing the token exchange and only proceeds on the expected GET request.

If you see a `ErrorInvalidGrant` in a previous wrangler version when running `wrangler login`, please try upgrading to this version or later.
