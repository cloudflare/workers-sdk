---
"wrangler": patch
---

internal: middleware for modifying worker behaviour

This adds an internal mechanism for applying multiple "middleware"/facades on to workers. This lets us add functionality during dev and/or publish, where we can modify requests or env, or other ideas. (See https://github.com/cloudflare/wrangler2/issues/1466 for actual usecases)

As part of this, I implemented a simple facade that formats errors in dev. To enable it you need to set an environment variable `FORMAT_WRANGLER_ERRORS=true`. This _isn't_ a new feature we're shipping with wrangler, it's simply to demonstrate how to write middleware. We'll probably remove it in the future.
