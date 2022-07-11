---
"wrangler": patch
---

chore: run emit-types only in CI

This fix also runs `emit-types` only when doing a full build, so local dev is faster.

Fixes https://github.com/cloudflare/wrangler2/issues/1435
