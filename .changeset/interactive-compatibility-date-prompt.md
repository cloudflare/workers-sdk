---
"wrangler": minor
---

Prompt for missing deployment config interactively during `wrangler deploy`

When deploying without a `compatibility_date` in your Wrangler configuration file or `--compatibility-date` CLI argument, `wrangler deploy` now interactively prompts you to use today's date instead of failing with an error. In non-interactive or CI environments, the existing error message is still shown.

Additionally, interactive prompting for project name, compatibility date, and config file creation is now available for all `wrangler deploy` invocations when no config file exists — not just asset-only deployments. If you run `wrangler deploy ./index.js` without a `wrangler.json` file, Wrangler will prompt for any missing configuration and offer to save it to a `wrangler.jsonc` file for future use.
