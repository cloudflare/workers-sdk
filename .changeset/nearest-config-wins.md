---
"wrangler": patch
"@cloudflare/workers-utils": patch
---

Pick the nearest Wrangler configuration file, whatever its format

Wrangler searched for `wrangler.json` all the way up to the filesystem root before it looked for `wrangler.jsonc` or `wrangler.toml` at all, so a `wrangler.json` in any ancestor directory silently shadowed the project's own `wrangler.jsonc` or `wrangler.toml`. `wrangler deploy` then built the ancestor's Worker, with the ancestor's bindings, from a directory that has a perfectly good configuration file of its own.

Discovery now checks all three file names in each directory before moving up to its parent. The preference between formats is unchanged when more than one exists in the same directory: `wrangler.json`, then `wrangler.jsonc`, then `wrangler.toml`.
