---
"wrangler": patch
---

feat: zoned worker support for `wrangler dev`

This implements support for zoned workers in `wrangler dev`. Of note, since we're deprecating `zone_id`, we instead use the domain provided via `--host`/`config.dev.host`/`--routes`/`--route`/`config.routes`/`config.route` and infer the zone id from it.

Fixes https://github.com/cloudflare/wrangler2/issues/544
