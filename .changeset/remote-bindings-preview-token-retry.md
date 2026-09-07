---
"wrangler": patch
---

Fix remote bindings sessions never recovering after a network outage longer than a few seconds

A `wrangler dev --remote` session (and any long-lived session built on `@cloudflare/remote-bindings`, such as `getPlatformProxy()`) proactively refreshes its preview token every 50 minutes, ahead of the token's 1-hour expiry. If that refresh failed — for example, the machine briefly lost network connectivity — the retry cycle stopped for good: nothing else re-triggers a refresh attempt for a session that isn't otherwise reloading, so the session stayed broken even after connectivity returned, with no way to recover short of a restart.

A failed refresh now keeps retrying on a one-minute interval until it succeeds, so a transient outage (a laptop moving between networks, a VPN reconnect, etc.) no longer permanently strands a long-running dev session.
