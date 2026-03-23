---
"wrangler": patch
"miniflare": patch
---

fix: prevent remote binding sessions from expiring during long-running dev sessions

Preview tokens for remote bindings expire after one hour. Previously, the first request after expiry would fail before a refresh was triggered. This change proactively refreshes the token at 50 minutes so no request ever sees an expired session.

The reactive recovery path is also improved: `error code: 1031` responses (returned by bindings such as Workers AI when their session times out) now correctly trigger a refresh, where previously only `Invalid Workers Preview configuration` HTML responses did.

Auth credentials are now resolved lazily when a remote proxy session starts rather than at bundle-complete time. This means that if your OAuth access token has been refreshed since `wrangler dev` started, the new token is used rather than the one captured at startup.
