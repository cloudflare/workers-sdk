---
"@cloudflare/codemods": patch
---

Preserve top-level Wrangler tooling settings when migrating named environments

Named-environment values for top-level-only fields are ignored by Wrangler. The migration now retains top-level settings for every generated mode instead of converting invalid overrides into mode-specific behavior.
