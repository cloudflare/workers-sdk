---
"wrangler": minor
---

feat: add support for placement in wrangler config

Allows a `placement` object in the wrangler config with a mode of `off` or `smart` to configure [Smart placement](https://developers.cloudflare.com/workers/platform/smart-placement/). Enabling Smart Placement can be done in your `wrangler.toml` like:

```toml
[placement]
mode = "smart"
```
