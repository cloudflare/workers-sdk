---
"wrangler": minor
"@cloudflare/containers-shared": patch
---

Rewrite `wrangler containers list` to use the paginated Dash API endpoint

`wrangler containers list` now fetches from the `/dash/applications` endpoint instead of `/applications`, displaying results in a paginated table with columns for ID, Name, State, Live Instances, and Last Modified. Container state is derived from health instance counters (active, degraded, provisioning, ready).

The command supports `--per-page` (default 25) for interactive pagination with Enter to load more and q/Esc to quit, and `--json` for machine-readable output. Non-interactive environments load all results in a single request.
