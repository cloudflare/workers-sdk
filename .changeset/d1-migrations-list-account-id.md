---
"wrangler": patch
---

Use the `account_id` from the configuration file in `wrangler d1 migrations list --remote`

Before this change, the command ignored the `account_id` in the configuration file. When your login had access to more than one account, the command failed in non-interactive mode. In interactive mode, it asked you to select an account. The command now uses the configured `account_id`, as `wrangler d1 migrations apply` does.
