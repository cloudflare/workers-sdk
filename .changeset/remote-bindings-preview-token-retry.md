---
"wrangler": patch
---

Keep remote dev sessions alive through transient network failures

`wrangler dev --remote` and `getPlatformProxy()` refresh their preview token before it expires, but a single failed refresh — for example while the network was briefly down — stopped refreshing for good, leaving the session broken until restart. A failed refresh now retries every minute until it succeeds. Rebuilds also no longer push the refresh past the session's expiry.
