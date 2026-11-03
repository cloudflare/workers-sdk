---
"wrangler": patch
---

Offer to delete a Worker's Container applications when running `wrangler delete`

Previously, `wrangler delete` removed only the Worker, leaving the Container applications that `wrangler deploy` created for it running and billing. It now offers to delete them as well. With `--force`, or in CI and other non-interactive contexts, it lists them instead so they can be removed with `wrangler containers delete <id>`.
