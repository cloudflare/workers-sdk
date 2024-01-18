---
"@cloudflare/cli": patch
---

Downgraded `chalk` dependency from `^5.2.0` to `^2.4.2`

This was done for compatibility reasons with the version used in the `wrangler` package. See [#4310](https://github.com/cloudflare/workers-sdk/pull/4310) for more details.
