---
"miniflare": major
---

Remove automatic module graph discovery

Miniflare no longer discovers Worker modules from `modules: true` and `modulesRules`. Module workers must provide their module graph through the config manifest. Existing v4-shaped options can be migrated with `convertV4MiniflareOptions()`, but `modulesRules` cannot be converted without losing behavior.
