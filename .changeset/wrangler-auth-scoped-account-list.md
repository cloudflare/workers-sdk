---
"wrangler": patch
---

Only show accounts available for the current login auth in `wrangler whoami` (including `--json`) and the interactive account picker. Wrangler now lists the intersection of `/accounts` and `/memberships` instead of either endpoint alone, dropping accounts the active OAuth token or API token has no membership in; when `/memberships` is inaccessible to the current auth (e.g. Account API Tokens) Wrangler falls back to `/accounts` so those tokens continue to work as before.
