---
"wrangler": patch
---

Fix `Failed to fetch auth token: 401 Unauthorized` from sibling-rotated refresh tokens

`refreshToken` previously used the refresh token from module-level `localState`, which is populated once at startup and never re-read. OAuth refresh tokens are single-use, so when a sibling wrangler process (in another repo, another shell, or a parallel script) refreshes first, it rotates the token server-side and writes the new value to the shared config file (`~/Library/Preferences/.wrangler/config/default.toml` on macOS). The long-lived process — typically `wrangler dev` — then sends its stale in-memory token on the next refresh and gets `401 Unauthorized` from `https://dash.cloudflare.com/oauth2/token`, falling through to interactive login and timing out unattended.

`refreshToken` now calls `reinitialiseAuthTokens()` before exchanging, picking up the latest refresh token written by any sibling process. The previously empty `catch {}` also now logs the underlying error at debug level so future refresh failures are diagnosable without source-diving.
