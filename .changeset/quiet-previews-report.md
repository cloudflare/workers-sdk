---
"wrangler": minor
---

Return structured configuration errors from `wrangler preview --json`

When a Worker is missing its Preview configuration, JSON mode now returns an `error`, a `suggested_config` patch, and any associated onboarding `messages` without interactive output or terminal formatting. This changes the private-beta Preview command to make automated onboarding reliable.
