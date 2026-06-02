---
"wrangler": minor
---

Add restart-from-step options to `wrangler workflows instances restart`

You can now restart a Workflow instance from a specific step using `--from-step-name`, with optional `--from-step-count` and `--from-step-type` disambiguation. These options work for both remote Workflow instances and local `wrangler dev --local` sessions.
