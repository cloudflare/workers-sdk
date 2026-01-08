---
"wrangler": minor
---

Add ability to enable higher asset count limits for Pages deployments

Wrangler can now read asset count limits from JWT claims during Pages deployments,
allowing users to be enabled for higher limits (up to 100,000 assets) on a per-account
basis. The default limit remains at 20,000 assets.
