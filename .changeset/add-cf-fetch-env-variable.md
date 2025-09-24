---
"wrangler": minor
---

Fetch checking can now be controlled via the `WRANGLER_CF_FETCH` environment variable. Set to "true" to enable fetch checking or "false" to disable it, overriding the default behavior based on compatibility date and flags. This provides a convenient way to control fetch validation without modifying configuration files.
