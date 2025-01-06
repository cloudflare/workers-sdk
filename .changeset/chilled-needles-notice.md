---
"wrangler": patch
---

feat(wrangler): use unenv builtin dependency resolution

Moving away from `require.resolve()` to handle unenv aliased packages.
Using the unenv builtin resolution will allow us to drop the .cjs file from the preset
and to override the base path so that we can test the dev version of the preset.
