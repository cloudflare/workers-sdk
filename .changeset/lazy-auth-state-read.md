---
"wrangler": patch
---

Read the on-disk OAuth state lazily so `CLOUDFLARE_API_TOKEN` from `.env` takes priority correctly

Wrangler previously read its OAuth state from the user auth config file (for example `~/.config/.wrangler/config/default.toml`) eagerly at module-import time. That happens _before_ `.env` files are loaded, so the in-memory state would always hold the OAuth tokens even when the user only wanted to authenticate via `CLOUDFLARE_API_TOKEN`. If that stored OAuth token happened to be expired, Wrangler would try to refresh it (and fail), aborting the command with `Failed to fetch auth token: 400 Bad Request` and `Not logged in.` — even though a valid API token was in scope.

Wrangler now reads the auth config file on demand, after `.env` has been loaded. When `CLOUDFLARE_API_TOKEN` (or `CLOUDFLARE_API_KEY` + `CLOUDFLARE_EMAIL`) is present, the OAuth state on disk is no longer consulted, the OAuth refresh endpoint is no longer called, and the env-based token is used directly. Sibling-process refresh-token rotation is also handled naturally because every check reads the current file contents.

Internally, the exported `reinitialiseAuthTokens()` function is removed — there is no module-level OAuth cache left to invalidate.

Fixes [#13744](https://github.com/cloudflare/workers-sdk/issues/13744).
