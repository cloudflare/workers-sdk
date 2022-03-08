---
"wrangler": patch
---

feat: support adding secrets in non-interactive mode

Now the user can pipe in the secret value to the `wrangler secret put` command.
For example:

```
cat my-secret.txt | wrangler secret put secret-key --name worker-name
```

This requires that the user is logged in, and has only one account, or that the `account_id` has been set in `wrangler.toml`.

Fixes #170
