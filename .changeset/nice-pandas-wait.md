---
"wrangler": patch
---

chore(wrangler): update unenv dependency version

The updated unenv contains a fix for the module resolution,
see <https://github.com/unjs/unenv/pull/378>.
That bug prevented us from using unenv module resolution,
see <https://github.com/cloudflare/workers-sdk/pull/7583>.
