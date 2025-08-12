---
"wrangler": minor
---

Show possible local vs. dashboard diff information on deploys

When re-deploying a Worker using `wrangler deploy`, if the configuration has been modified in the Cloudflare dashboard, the local configuration will overwrite the remote one. This can lead to unexpected results for users. To address this, currently `wrangler deploy` warns users about potential configuration overrides (without presenting them) and prompts them to confirm whether they want to proceed.

The changes here improve the above flow in the following way:

- If the local changes only add new configurations (without modifying or removing existing ones), the deployment proceeds automatically without warnings or prompts, as these changes are non-destructive and safe.
- If the local changes modify or remove existing configurations, `wrangler deploy` now displays a git-like diff showing the differences between the dashboard and local configurations. This allows users to review and understand the impact of their changes before confirming the deployment.
