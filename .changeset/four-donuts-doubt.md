---
"wrangler": patch
---

Wrangler now supports an `--experimental-json-config` flag which will read your configuration from a `wrangler.json` file, rather than `wrangler.toml`. The format of this file is exactly the same as the `wrangler.toml` configuration file, except that the syntax is `JSONC` (JSON with comments) rather than `TOML`. This is experimental, and is not recommended for production use.
