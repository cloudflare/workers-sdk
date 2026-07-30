---
"miniflare": major
---

Remove the module-rule API from Miniflare: `compileModuleRules`, `ModuleRuleTypeSchema`, `ModuleRule`, and `ModuleRuleType`

Modules must now be provided inline via the config manifest, so module rules are no longer used.
