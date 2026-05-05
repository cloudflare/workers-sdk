---
"wrangler": minor
---

Prompt for missing name and compatibility date interactively during `wrangler deploy`

When deploying without a project name or `compatibility_date` in your configuration or CLI arguments, `wrangler deploy` now interactively prompts for the missing values instead of immediately failing with an error. For compatibility date, the prompt offers to use today's date; if you decline, the existing error is shown. The compatibility date prompt is skipped when `--latest` is passed. In non-interactive or CI environments, behavior is unchanged.

Additionally, when no config file exists, `wrangler deploy` now offers to save the prompted name and compatibility date to a `wrangler.jsonc` file for future use. This interactive flow is available for all `wrangler deploy` invocations — not just asset-only deployments.
