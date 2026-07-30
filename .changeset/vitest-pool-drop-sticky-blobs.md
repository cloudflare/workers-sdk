---
"@cloudflare/vitest-pool-workers": patch
---

Stop enabling Miniflare's removed `unsafeStickyBlobs` option

The pool no longer sets the `unsafeStickyBlobs` Miniflare option, which has been removed. This option was only needed for the Durable Object isolated storage feature that was dropped in 0.13.0, so there is no change in behaviour.
