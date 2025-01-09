---
"wrangler": minor
---

allow overriding the unenv preset.

By default wrangler uses the bundled unenv preset.

Setting `WRANGLER_UNENV_RESOLVE_PATHS` allow to use another version of the preset.
Those paths are used when resolving the unenv module identifiers to absolute paths.
This can be used to test a development version.
