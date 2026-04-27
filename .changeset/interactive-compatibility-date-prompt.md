---
"wrangler": minor
---

Prompt for compatibility date interactively when not provided during `wrangler deploy`

When deploying without a `compatibility_date` in your Wrangler config or `--compatibility-date` CLI argument, `wrangler deploy` now interactively prompts you to use today's date instead of failing with an error. In non-interactive or CI environments, the existing error message is still shown.
