---
"wrangler": patch
---

Only show accounts available for the current login auth in `wrangler whoami` and the interactive account picker

Wrangler now intersects the `/accounts` and `/memberships` endpoints when listing accounts. Previously, `wrangler whoami` rendered every account the underlying user belonged to, which could include accounts the active OAuth token or API token had no membership in. The interactive `Select an account` prompt was sourced from `/memberships` alone and so could disagree with `whoami`.

The accounts list — including the `accounts` field of `wrangler whoami --json` — is now the intersection of both endpoints, so it reflects the accounts the current login auth can actually use. For Account API Tokens (where `/memberships` is unavailable) the behavior is unchanged: the single account associated with the token is shown.
