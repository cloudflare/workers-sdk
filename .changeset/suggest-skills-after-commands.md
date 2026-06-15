---
"wrangler": minor
---

Suggest Cloudflare skills installation after commands instead of before

The automatic prompt to install Cloudflare skills for detected AI coding agents no longer runs before every Wrangler command. Instead, Wrangler now suggests installing skills, when appropriate, after some commands complete successfully. Commands that output JSON suppress the suggestion to keep their output clean. The `--install-skills` flag remains available on all commands to explicitly run the skills installation flow before the command executes, without prompting.

As before, Wrangler asks the skills installation question at most once. The skills install metadata file is now written before the confirmation prompt is shown, so even if the user interrupts the process (e.g. CTRL+C, closing the terminal) during the prompt, the question is recorded as unanswered and will not reappear on subsequent runs.
