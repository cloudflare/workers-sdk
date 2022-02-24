---
"wrangler": patch
---

feat: secrets + environments

This implements environment support for `wrangler secret` (both legacy and services). We now consistently generate the right script name across commands with the `getScriptName()` helper.

Based on the work by @mitchelvanbever in https://github.com/cloudflare/wrangler2/pull/95.
