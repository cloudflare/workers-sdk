---
"wrangler": patch
---

fix: don't crash when tail event is null

Sometime the "event" on a tail can be null. This patch makes sure we don't crash when that happens. Fixes https://github.com/cloudflare/wrangler2/issues/918
