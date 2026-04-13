---
"wrangler": patch
"miniflare": patch
---

Make startup network requests non-blocking on slow connections

Wrangler makes network requests during startup (npm update check, `request.cf` data fetch) that previously blocked the CLI indefinitely on slow or degraded connections (airplane wifi, trains), causing 10+ second delays.

- **Update check**: The banner now races the update check against a 100ms grace period. On a cache hit (most runs) the result resolves in <1ms via the I/O poll phase; on a cache miss the banner prints immediately without blocking. A 3s safety-net timeout caps the `update-check` library's auth-retry path.
- **`request.cf` fetch**: The fetch to `workers.cloudflare.com/cf.json` now uses `AbortSignal.timeout(3000)`, falling back to cached/default data on timeout.
