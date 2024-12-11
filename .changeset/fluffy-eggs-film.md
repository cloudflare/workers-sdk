---
"wrangler": minor
---

feat(wrangler): allow overriding the unenv preset path

By default wrangler uses the unenv preset installed via package.json.

Setting `WRANGLER_UNENV_PRESET_PATH` allow to use a local version of the preset.
This can be used to test a development version.
