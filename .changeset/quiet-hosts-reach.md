---
"@cloudflare/workers-auth": patch
"wrangler": patch
---

Report an unreachable auth server instead of an expired login when refreshing an OAuth token

When the OAuth token endpoint could not be reached (for example a DNS failure or a connection timeout), the refresh failure was reported as "Your auth token has expired and could not be refreshed", with advice to run `wrangler login`; in an interactive terminal Wrangler also started a new browser login. A network failure says nothing about the stored refresh token, and a new login would need the same unreachable server. Wrangler now reports that the Cloudflare auth server could not be reached, leaves the stored credentials unchanged, and does not start a login, so the next run can refresh with the same token once the network is back.
