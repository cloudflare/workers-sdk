---
"wrangler": patch
---

feat: bind a durable object by environment

For durable objects, instead of just `{ name, class_name, script_name}`, this lets you bind by environment as well, like so `{ name, class_name, script_name, environment }`.

Fixes https://github.com/cloudflare/wrangler2/issues/996
