---
"@cloudflare/deploy-helpers": patch
---

fix: infer Preview/git branch names from unborn repositories

`getBranchName()` previously used `git rev-parse --abbrev-ref HEAD`, which fails (and can leak stderr) before the first commit, and returns the literal `HEAD` on detached checkouts. It now uses `git symbolic-ref --short HEAD` with stderr suppressed so unborn branches resolve and detached checkouts return no inferred name.

Refs: cloudflare/cf#24
