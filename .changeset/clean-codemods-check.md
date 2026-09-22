---
"@cloudflare/codemods": minor
---

Require a clean Git worktree before running codemods

Codemods now stop before changing files when the target Git worktree contains staged, unstaged, or untracked changes. Pass `--force` to bypass this safety check.
