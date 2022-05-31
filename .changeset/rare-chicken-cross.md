---
"wrangler": patch
---

polish: Give a copy-paste config when `[migrations]` are missing

This gives a slightly better message when migrations are missing for declared durable objcts. Specifically, it gives a copy-pastable section to add to wrangler.toml, and doesn't show the warning at all for invalid class names anymore.

Partially makes https://github.com/cloudflare/wrangler2/issues/1076 better.
