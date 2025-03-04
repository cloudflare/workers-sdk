---
"@cloudflare/vitest-pool-workers": patch
"miniflare": patch
"wrangler": patch
---

feat: Add assets Proxy Worker skeleton in miniflare

This commit implements a very basic Proxy Worker skeleton, and wires it in the "pipeline" miniflare creates for assets. This Worker will be incrementally worked on, but for now, the current implementation will forward all incoming requests to the Router Worker, thus leaving the current assets behaviour in local dev, the same.

This is an experimental feature available under the `--x-assets-rpc` flag: `wrangler dev --x-assets-rpc`.
