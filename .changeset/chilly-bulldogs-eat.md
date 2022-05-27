---
"dev-tunnel": patch
"wrangler": patch
---

Initial implementation of sharable dev sessions

The `dev-tunnel` package contains a simple proxy worker that allows `wrangler` users to send HTTP requests to register their local dev sessions as a request endpoint. The `dev-tunnel` worker will then register a unique ID to that session, and forward all requests to `/<tunnel-id>/*` to that session.

This implementation introduces some additional latency in the case of running a non-local (i.e. on Cloudflare's edge) dev session, as requests go to Cloudflare, then to the user's machine, then back to cloudflare. This feels acceptable to me, as the tradeoff is that it no longer matters whether the user is in local or remote mode.
