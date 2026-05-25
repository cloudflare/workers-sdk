---
"wrangler": patch
---

Fix `wrangler complete` printing the AI skills prompt into shell completion output

Previously, running `eval "$(wrangler complete zsh)"` (or any other shell) would fail with errors like `zsh: command not found: --install-skills` because the interactive AI agent skills installation prompt was included in the completion script output.

The skills prompt is now skipped when running `wrangler complete`, so the generated completion script is clean and can be sourced correctly.
