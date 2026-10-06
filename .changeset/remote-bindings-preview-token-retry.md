---
"@cloudflare/remote-bindings": patch
"wrangler": patch
---

Keep remote preview sessions alive across reloads and transient outages

A `wrangler dev --remote` session (and any long-lived session built on `@cloudflare/remote-bindings`, such as `getPlatformProxy()`) proactively refreshes its preview token every 50 minutes, ahead of the token's 1-hour expiry. If that refresh failed — for example, the machine briefly lost network connectivity — the retry cycle stopped for good: nothing else re-triggers a refresh attempt for a session that isn't otherwise reloading, so the session stayed broken even after connectivity returned, with no way to recover short of a restart.

A failed refresh now keeps retrying on a one-minute interval until it succeeds, so a transient outage (a laptop moving between networks, a VPN reconnect, etc.) no longer permanently strands a long-running dev session.

Rebuilds reuse the original preview session, so they now preserve its refresh deadline instead of postponing it beyond expiry. Failed rebuilds keep the refresh timer alive; switching from remote to local mode still stops it.
