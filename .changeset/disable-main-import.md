---
"@cloudflare/vitest-pool-workers": minor
---

Allow `main: false` to disable automatic entrypoint import

Setting `main: false` in pool options explicitly opts out of importing the worker entrypoint, even when a wrangler config provides one. This is useful for pure unit testing scenarios where `SELF` and Durable Object bindings to the current worker are not needed, avoiding unnecessary setup overhead.
