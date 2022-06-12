---
"wrangler": patch
---

feat: support `--experimental-public` in local mode

`--experimental-public` is an abstraction over Workers Sites, and we can leverage miniflare's inbuilt support for Sites to serve assets in local mode.
