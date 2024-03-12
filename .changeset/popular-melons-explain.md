---
"wrangler": minor
---

feature: Implement `wrangler versions deploy` command.

For now, invocations should use the `--experimental-gradual-rollouts` flag.

Without args, a user will be guided through prompts. If args are specified, they are used as the default values for the prompts. If the `--yes` flag is specified, the defaults are automatically accepted for a non-interactive flow.
