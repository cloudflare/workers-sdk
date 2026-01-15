---
"wrangler": patch
---

Fix error messages to correctly display `wrangler.jsonc` instead of `wrangler.json` when using a `.jsonc` config file.

When users had a `wrangler.jsonc` configuration file, error messages would incorrectly reference `wrangler.json`. This has been fixed to show the correct filename based on the actual file extension.
