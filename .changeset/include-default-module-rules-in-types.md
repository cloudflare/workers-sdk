---
"wrangler": patch
---

Include default module rules in generated types

The `wrangler types` command now includes module declarations for default module rules (_.txt, _.html, _.sql, _.bin, \*.wasm) even when no explicit rules are defined in the configuration file. Previously, module declarations were only generated when rules were explicitly added to wrangler.toml/wrangler.json, which meant default rules that are automatically applied during deployment were missing from the generated types.
