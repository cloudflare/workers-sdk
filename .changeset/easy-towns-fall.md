---
"wrangler": minor
---

chore: Added support for --tag and --message in `wrangler deploy` when using the verisons/deployments API (essentially when not using Service Worker format and Durable Objects).

This lets you specify a tag and message for the deployment, which is useful for tracking changes and managing deployments more effectively. This was previously only available on the `wrangler versions upload` command.
