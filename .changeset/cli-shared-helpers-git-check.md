---
"@cloudflare/cli-shared-helpers": minor
---

Add `ensureCleanGitWorktree` to `@cloudflare/cli-shared-helpers/git`

It checks that a directory is outside Git or in a clean Git worktree before a command changes it, so tools other than the codemods can use the same check.
