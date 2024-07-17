---
"wrangler": minor
---

feat: Add support for `wrangler.jsonc`

This commit adds support for `wrangler.jsonc` config file for Workers. This feature is available behind the `--experimental-json-config` flag (just like `wrangler.json`).

To use the new configuration file, add a `wrangler.jsonc` file to your Worker project and run `wrangler dev --experimental-json-config` or `wrangler deploy --experimental-json-config`.

Please note that this work does NOT add `wrangler.json` or `wrangler.jsonc` support for Pages projects!
