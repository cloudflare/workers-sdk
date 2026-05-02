---
"wrangler": patch
---

Pass the local dev zone through `unstable_getMiniflareWorkerOptions`

When `@cloudflare/vite-plugin` asks Wrangler for Miniflare worker options, the returned object did not include the inferred `zone`. Miniflare then fell back to `<worker>.example.com` for the `CF-Worker` header, which differs from the `wrangler dev --local` path and can cause some upstreams to reject local subrequests.

This now forwards the same `dev.host` or inferred route host that Wrangler already uses in local dev so Vite-backed local development matches the existing local runtime behavior.
