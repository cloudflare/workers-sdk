---
"wrangler": patch
---

Show `wrangler pages dev --proxy` warning

On Node.js 17+, wrangler will default to fetching only the IPv6 address. With these changes we warn users that the process listening on the port specified via `--proxy` should be configured for IPv6.
