---
"wrangler": patch
"@cloudflare/workers-utils": patch
---

Fix `configFileName` returning wrong filename for `.jsonc` config files

Previously, users with a `wrangler.jsonc` config file would see error messages and hints referring to `wrangler.json` instead of `wrangler.jsonc`. This was because the `configFormat` function collapsed both `.json` and `.jsonc` files into a single `"jsonc"` value, losing the distinction between them.

Now `configFormat` returns `"json"` for `.json` files and `"jsonc"` for `.jsonc` files, allowing `configFileName` to return the correct filename for each format.
