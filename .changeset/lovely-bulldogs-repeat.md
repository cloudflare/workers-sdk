---
"wrangler": patch
---

fix: log pubsub beta usage warnings consistently

This fix makes sure the pubsub beta warnings are logged consistently, once per help menu, through the hierarchy of its command tree.

Fixes https://github.com/cloudflare/wrangler2/issues/1370
