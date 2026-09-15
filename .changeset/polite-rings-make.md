---
"wrangler": minor
---

Improve onboarding guidance for Previews (when `previews` block is missing from configuration file)

When a local `previews` block is absent, Wrangler writes the Preview Base configuration to the local config file. When no Preview Base configuration exists, Wrangler prints a placeholder configuration derived from production bindings and warns against reusing production binding configuration.
