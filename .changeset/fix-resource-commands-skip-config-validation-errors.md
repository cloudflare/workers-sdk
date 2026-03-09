---
"wrangler": patch
---

fix: resource management commands (r2, d1, kv, vectorize, queues, ai, workflows, hyperdrive) no longer fail when the local wrangler.jsonc has validation errors

Commands that operate on account-level resources — such as `wrangler r2 bucket list`, `wrangler d1 list`, `wrangler kv namespace list`, etc. — previously threw a fatal error if the wrangler.jsonc file in the current directory had validation errors (e.g. an invalid bucket name). These commands don't require a valid worker config to work, so validation errors are now shown as warnings instead of blocking the command.

Use `behaviour.skipConfigValidationErrors: true` in a command definition to opt in to this behaviour.
