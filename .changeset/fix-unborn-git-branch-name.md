---
"@cloudflare/deploy-helpers": patch
---

fix: infer Preview/git branch names from unborn repositories

`getBranchName()` previously used `git rev-parse --abbrev-ref HEAD`, which fails (and can leak stderr) before the first commit, and returns the literal `HEAD` on detached checkouts. It now uses `git branch --show-current` with stderr suppressed so unborn branches resolve and detached checkouts return no inferred name.

Preview commit ref, commit message, and the CI repository URL git fallback swallow stderr the same way, so an unborn repository does not print Git fatal errors.

Refs: cloudflare/cf#24
