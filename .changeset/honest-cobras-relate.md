---
"wrangler": patch
---

fix: fallback on old zone-based API when account-based route API fails

While we wait for changes to the CF API to support API tokens that do not have
"All Zone" permissions, this change provides a workaround for most scenarios.

If the bulk-route request fails with an authorization error, then we fallback
to the Wrangler 1 approach, which sends individual route updates via a zone-based
endpoint.

Fixes #651
