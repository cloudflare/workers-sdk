---
"wrangler": minor
---

feature: added a new `wrangler triggers deploy` command

This command currently requires the `--experimental-versions` flag.

This command extracts the trigger deployment logic from `wrangler deploy` and allows users to update their currently deployed Worker's triggers without doing another deployment. This is primarily useful for users of `wrangler versions upload` and `wrangler versions deploy` who can then run `wrangler triggers deploy` to apply trigger changes to their currently deployed Worker Versions.

The command can also be used even if not using the `wrangler versions ...` commands. And, in fact, users are already using it implicitly when running `wrangler deploy`.
