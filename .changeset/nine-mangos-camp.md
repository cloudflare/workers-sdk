---
"wrangler": minor
---

Add confirmation prompt to `wrangler containers images delete`

Previously, running `wrangler containers images delete IMAGE:TAG` would delete the image immediately with no confirmation. The command now prompts for confirmation before deleting. Use `-y` or `--skip-confirmation` to bypass the prompt in non-interactive or scripted environments.
