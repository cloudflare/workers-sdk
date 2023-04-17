---
"wrangler": patch
---

fix: Teach D1 commands to read auth configuration from wrangler.toml

This PR fixes a bug in how D1 handles a user's accounts. We've updated the D1 commands to read from config (typically via wrangler.toml) before trying to run commands. This means if an `account_id` is defined in config, we'll use that instead of erroring out when there are multiple accounts to pick from.

Fixes #3046
