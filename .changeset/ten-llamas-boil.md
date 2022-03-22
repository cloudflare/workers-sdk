---
"wrangler": patch
---

fix: delete unused `[site]` assets

We discovered critical issues with the way we expire unused assets with `[site]` (see https://github.com/cloudflare/wrangler2/issues/666, https://github.com/cloudflare/wrangler/issues/2224), that we're going back to the legacy manner of handling unused assets, i.e- deleting unused assets.

Fixes https://github.com/cloudflare/wrangler2/issues/666
