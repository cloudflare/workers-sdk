---
"wrangler": patch
---

Preserve `--compatibility-flags` in the interactive deploy config flow

When running `wrangler deploy` without a config file and going through the interactive setup flow, any `--compatibility-flags` passed on the command line (e.g. `--compatibility-flags=nodejs_compat`) were lost in two places:

1. The generated `wrangler.jsonc` file did not include `compatibility_flags`.
2. The suggested CLI command shown when declining the config file write did not include `--compatibility-flags`.

Both are now fixed. Compatibility flags are persisted to the generated config and included in the suggested command.
