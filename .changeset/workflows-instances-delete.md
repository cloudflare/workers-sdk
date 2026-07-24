---
"wrangler": minor
"miniflare": minor
---

Add individual and batch workflow instance deletion support.

- `wrangler workflows instances delete <name> <id..>` deletes one or up to 100 workflow instances (works remotely and in local dev via `--local`).
- The Workflows binding now supports both `env.MY_WORKFLOW.get(id).delete()` and `env.MY_WORKFLOW.deleteBatch(instanceIds)` in local development.
